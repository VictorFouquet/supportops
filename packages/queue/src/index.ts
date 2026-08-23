import { Queue, Worker, type Processor } from 'bullmq';
import { Redis } from 'ioredis';

/** The single queue notifications are delivered through. */
export const NOTIFICATION_QUEUE_NAME = 'notifications';

/** A delivery job carries only the id of the persisted notification to send. */
export interface NotificationJobData {
  notificationId: string;
}

/**
 * The narrow producer surface the API depends on, decoupled from BullMQ so a
 * caller (or a test) can supply any implementation.
 */
export interface NotificationProducer {
  add(data: NotificationJobData): Promise<void>;
  close(): Promise<void>;
}

/**
 * A Redis connection for BullMQ.
 *
 * The default is resilient — it keeps reconnecting — which is what a long-running
 * worker wants. Pass `{ failFast: true }` for the producer side, where enqueuing
 * is best-effort: a missing or slow Redis then rejects quickly instead of
 * buffering commands or reconnecting forever, so a product action never hangs on
 * it. `maxRetriesPerRequest` is always `null`, as BullMQ requires.
 */
export function createRedisConnection(
  redisUrl: string,
  options: { failFast?: boolean } = {},
): Redis {
  if (options.failFast) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (attempt: number) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
    });
  }
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

/** Build the producer used to enqueue delivery jobs. */
export function createNotificationQueue(connection: Redis): NotificationProducer {
  const queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, { connection });
  return {
    async add(data) {
      await queue.add('notify', data, { removeOnComplete: true, removeOnFail: 100 });
    },
    async close() {
      await queue.close();
    },
  };
}

/** Build the worker that consumes delivery jobs. */
export function createNotificationWorker(
  connection: Redis,
  processor: Processor<NotificationJobData, void>,
): Worker<NotificationJobData, void> {
  return new Worker<NotificationJobData, void>(NOTIFICATION_QUEUE_NAME, processor, { connection });
}
