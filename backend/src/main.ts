import app from './app.js';
import { config } from './config/index.js';
import { db } from './config/database.js';

const PORT = config.APP_PORT;

async function main() {
  try {
    await db.$connect();
    console.log('[DB] Connected to PostgreSQL');

    app.listen(PORT, () => {
      console.log(`[SERVER] OpenClaw Wiki API running on port ${PORT}`);
      console.log(`[SERVER] Environment: ${config.APP_ENV}`);
    });
  } catch (error) {
    console.error('[STARTUP] Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully...');
  await db.$disconnect();
  process.exit(0);
});

main();
