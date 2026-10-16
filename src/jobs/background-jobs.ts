import type { Env } from '../config/env.js';
import { createAdminClient } from '../config/supabase.js';
import { runPushNotificationDispatch } from './dispatch-push-notifications.js';
import { parseEventSyncJobOptions, runEventSyncJob } from './sync-astronomical-events.js';

export interface BackgroundJob {
  name: string;
  intervalMs: number;
  /** When provided, a tick only runs the job if this resolves to true. */
  shouldRun?(): Promise<boolean>;
  run(): Promise<unknown>;
}

export interface BackgroundJobLogger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

export interface BackgroundJobTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const consoleLogger: BackgroundJobLogger = {
  info: (entry) => console.log(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry)),
};

const nodeTimers: BackgroundJobTimers = {
  setInterval: (callback, ms) => {
    const handle = setInterval(callback, ms);
    handle.unref();
    return handle;
  },
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

/**
 * Runs each job immediately and then on its interval. A job never overlaps with itself, and a
 * failure is logged without stopping the API or the other jobs.
 */
export function startBackgroundJobs(
  jobs: readonly BackgroundJob[],
  logger: BackgroundJobLogger = consoleLogger,
  timers: BackgroundJobTimers = nodeTimers,
): { stop(): void; ticks: Map<string, () => Promise<void>> } {
  const handles: unknown[] = [];
  const ticks = new Map<string, () => Promise<void>>();

  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      const startedAt = Date.now();
      try {
        if (job.shouldRun && !(await job.shouldRun())) return;
        const result = await job.run();
        logger.info({
          job: job.name,
          status: 'succeeded',
          durationMs: Date.now() - startedAt,
          ...(result && typeof result === 'object' ? result : { result }),
        });
      } catch (error) {
        logger.error({
          job: job.name,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unknown background job failure',
        });
      } finally {
        running = false;
      }
    };
    ticks.set(job.name, tick);
    void tick();
    handles.push(timers.setInterval(() => void tick(), job.intervalMs));
  }

  return {
    stop: () => handles.forEach((handle) => timers.clearInterval(handle)),
    ticks,
  };
}

export function createDefaultBackgroundJobs(env: Env): BackgroundJob[] {
  const syncIntervalMs = env.EVENT_SYNC_INTERVAL_HOURS * 3_600_000;
  return [
    {
      name: 'push-notification-dispatch',
      intervalMs: env.NOTIFICATION_DISPATCH_INTERVAL_MINUTES * 60_000,
      run: () => runPushNotificationDispatch(),
    },
    {
      name: 'astronomical-event-sync',
      // Checked hourly; only synchronizes when the last success is older than the interval.
      intervalMs: Math.min(syncIntervalMs, 3_600_000),
      shouldRun: () => isEventSyncDue(env, syncIntervalMs),
      run: async () => ({
        eventCount: await runEventSyncJob(
          parseEventSyncJobOptions([
            `--latitude=${env.EVENT_SYNC_LATITUDE}`,
            `--longitude=${env.EVENT_SYNC_LONGITUDE}`,
            `--elevation=${env.EVENT_SYNC_ELEVATION}`,
            `--days=${env.EVENT_SYNC_DAYS}`,
          ]),
        ),
      }),
    },
  ];
}

async function isEventSyncDue(env: Env, intervalMs: number): Promise<boolean> {
  const { data, error } = await createAdminClient(env)
    .from('astronomical_event_sync_runs')
    .select('completed_at')
    .eq('status', 'succeeded')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Without a readable history (e.g. pending migration) the sync is attempted and its error logged.
  if (error) return true;
  const completedAt = (data as { completed_at?: unknown } | null)?.completed_at;
  return typeof completedAt !== 'string' || Date.now() - Date.parse(completedAt) >= intervalMs;
}
