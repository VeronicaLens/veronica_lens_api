import 'dotenv/config';
import { pathToFileURL } from 'node:url';

import { getEnv } from '../config/env.js';
import { createAdminClient } from '../config/supabase.js';
import { ExpoPushProvider } from '../modules/notifications/expo-push.provider.js';
import { SupabaseNotificationDispatchPersistence } from '../modules/notifications/notification-dispatch.persistence.js';
import { NotificationDispatchService } from '../modules/notifications/notification-dispatch.service.js';

export async function runPushNotificationDispatch(now = new Date()) {
  const client = createAdminClient(getEnv());
  const service = new NotificationDispatchService(
    new SupabaseNotificationDispatchPersistence(() => client),
    new ExpoPushProvider(),
  );
  return await service.dispatch(now);
}

async function main(): Promise<void> {
  try {
    const report = await runPushNotificationDispatch();
    console.log(
      JSON.stringify({
        job: 'push-notification-dispatch',
        status: 'succeeded',
        ...report,
        completedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        job: 'push-notification-dispatch',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown notification dispatch failure',
        completedAt: new Date().toISOString(),
      }),
    );
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) void main();
