import 'dotenv/config';

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createDefaultBackgroundJobs, startBackgroundJobs } from './jobs/background-jobs.js';

const env = getEnv();
const app = createApp({ corsOrigin: env.CORS_ORIGIN });

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`VeronicaLens API listening on http://${env.HOST}:${env.PORT}`);
});

let backgroundJobs: ReturnType<typeof startBackgroundJobs> | null = null;
if (!env.BACKGROUND_JOBS_ENABLED || env.NODE_ENV === 'test') {
  console.log('Background jobs disabled');
} else if (!env.SUPABASE_SECRET_KEY) {
  console.warn('Background jobs skipped: SUPABASE_SECRET_KEY is required for event sync and push');
} else {
  backgroundJobs = startBackgroundJobs(createDefaultBackgroundJobs(env));
  console.log(
    `Background jobs started: push every ${env.NOTIFICATION_DISPATCH_INTERVAL_MINUTES} min, event sync every ${env.EVENT_SYNC_INTERVAL_HOURS} h`,
  );
}

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  backgroundJobs?.stop();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
