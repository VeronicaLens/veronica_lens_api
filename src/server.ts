import 'dotenv/config';

import { createApp } from './app.js';
import { getEnv } from './config/env.js';

const env = getEnv();
const app = createApp({ corsOrigin: env.CORS_ORIGIN });

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`VeronicaLens API listening on http://${env.HOST}:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
