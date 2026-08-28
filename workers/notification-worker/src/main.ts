import { loadConfig } from '@supportops/config';
import { createNotificationWorker, createRedisConnection } from '@supportops/queue';
import { ConsoleTransport, deliverNotification } from '@supportops/notifications';

const config = loadConfig();
const connection = createRedisConnection(config.REDIS_URL);
const transport = new ConsoleTransport();

const worker = createNotificationWorker(connection, (job) =>
  deliverNotification(job.data.notificationId, transport),
);

worker.on('ready', () => console.log('[notification-worker] ready'));
worker.on('failed', (job, err) =>
  console.error(`[notification-worker] job ${job?.id ?? '?'} failed:`, err),
);

async function shutdown(signal: string): Promise<void> {
  console.log(`[notification-worker] received ${signal}, shutting down`);
  await worker.close();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
