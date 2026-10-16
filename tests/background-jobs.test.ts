import { describe, expect, it, vi } from 'vitest';

import {
  startBackgroundJobs,
  type BackgroundJobLogger,
  type BackgroundJobTimers,
} from '../src/jobs/background-jobs.js';

function fakeTimers() {
  const callbacks: (() => void)[] = [];
  const clearInterval = vi.fn();
  const timers: BackgroundJobTimers = {
    setInterval: (callback) => {
      callbacks.push(callback);
      return callbacks.length - 1;
    },
    clearInterval,
  };
  return { timers, clearInterval, fire: () => callbacks.forEach((callback) => callback()) };
}

function logger() {
  return { info: vi.fn(), error: vi.fn() } satisfies BackgroundJobLogger;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startBackgroundJobs', () => {
  it('runs each job on start and on every interval', async () => {
    const run = vi.fn().mockResolvedValue({ sent: 1 });
    const { timers, fire } = fakeTimers();
    const log = logger();

    startBackgroundJobs([{ name: 'dispatch', intervalMs: 1000, run }], log, timers);
    await flush();
    fire();
    await flush();

    expect(run).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'dispatch', status: 'succeeded', sent: 1 }),
    );
  });

  it('does not overlap a job that is still running', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { timers, fire } = fakeTimers();

    startBackgroundJobs([{ name: 'slow', intervalMs: 1000, run }], logger(), timers);
    fire();
    fire();
    await flush();

    expect(run).toHaveBeenCalledTimes(1);
    finish();
  });

  it('skips runs that are not due and logs failures without throwing', async () => {
    const skipped = vi.fn().mockResolvedValue(undefined);
    const failing = vi.fn().mockRejectedValue(new Error('provider down'));
    const log = logger();
    const { timers, clearInterval } = fakeTimers();

    const jobs = startBackgroundJobs(
      [
        { name: 'sync', intervalMs: 1000, shouldRun: () => Promise.resolve(false), run: skipped },
        { name: 'dispatch', intervalMs: 1000, run: failing },
      ],
      log,
      timers,
    );
    await flush();
    jobs.stop();

    expect(skipped).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith({
      job: 'dispatch',
      status: 'failed',
      message: 'provider down',
    });
    expect(clearInterval).toHaveBeenCalledTimes(2);
  });
});
