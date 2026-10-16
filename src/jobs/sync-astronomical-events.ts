import 'dotenv/config';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import { getEnv } from '../config/env.js';
import { createAdminClient } from '../config/supabase.js';
import { JplHorizonsProvider } from '../modules/astronomy/jpl-horizons.provider.js';
import { LocalCatalogModel } from '../modules/catalog/catalog.model.js';
import { CachedAstronomyEventsModel } from '../modules/events/events.model.js';
import { SupabaseEventsPersistence } from '../modules/events/events.persistence.js';

const optionsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  elevation: z.coerce.number().min(-500).max(10_000).default(0),
  days: z.coerce.number().int().min(1).max(31).default(31),
  from: z.iso.datetime({ offset: true }).optional(),
});

export interface EventSyncJobOptions {
  latitude: number;
  longitude: number;
  elevation: number;
  days: number;
  from: Date;
}

export function parseEventSyncJobOptions(
  args: string[],
  now: Date = new Date(),
): EventSyncJobOptions {
  const values = parseNamedArguments(args);
  const parsed = optionsSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid event synchronization options: ${fields}`);
  }
  return {
    ...parsed.data,
    from: parsed.data.from ? new Date(parsed.data.from) : startOfUtcDay(now),
  };
}

export async function runEventSyncJob(options: EventSyncJobOptions): Promise<number> {
  const env = getEnv();
  const persistence = new SupabaseEventsPersistence(() => createAdminClient(env));
  const model = new CachedAstronomyEventsModel(
    new LocalCatalogModel(),
    new JplHorizonsProvider(),
    persistence,
  );
  const to = new Date(options.from.getTime() + options.days * 86_400_000);
  const result = await model.synchronize(
    {
      from: options.from,
      to,
      observer: {
        latitudeDegrees: options.latitude,
        longitudeDegrees: options.longitude,
        elevationMeters: options.elevation,
      },
    },
    true,
  );
  return result.events.length;
}

function parseNamedArguments(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) continue;
    const [rawName, inlineValue] = argument.slice(2).split('=', 2);
    const nextValue = args[index + 1];
    const value = inlineValue ?? (nextValue && !nextValue.startsWith('--') ? nextValue : undefined);
    if (rawName && value !== undefined) {
      values[rawName] = value;
      if (inlineValue === undefined) index += 1;
    }
  }
  return values;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function main(): Promise<void> {
  try {
    const options = parseEventSyncJobOptions(process.argv.slice(2));
    const eventCount = await runEventSyncJob(options);
    console.log(
      JSON.stringify({
        job: 'astronomical-event-sync',
        status: 'succeeded',
        eventCount,
        completedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        job: 'astronomical-event-sync',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown synchronization failure',
        completedAt: new Date().toISOString(),
      }),
    );
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) void main();
