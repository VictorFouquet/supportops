import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { NotificationService } from '@supportops/notifications';
import {
  createNotificationQueue,
  createRedisConnection,
  type NotificationProducer,
} from '@supportops/queue';

const NOTIFICATION_PRODUCER = Symbol('NOTIFICATION_PRODUCER');

export interface NotificationsModuleOptions {
  /** Override the queue producer — tests inject a null producer to stay off Redis. */
  producer?: NotificationProducer;
}

/**
 * Provides `NotificationService`, backed by a real BullMQ producer in production
 * and by an injected producer under test. The Redis connection fails fast so a
 * degraded queue never blocks the request that emits a notification.
 */
@Module({})
export class NotificationsModule {
  static register(config: AppConfig, opts: NotificationsModuleOptions = {}): DynamicModule {
    const producer =
      opts.producer ??
      createNotificationQueue(createRedisConnection(config.REDIS_URL, { failFast: true }));
    return {
      module: NotificationsModule,
      providers: [
        { provide: NOTIFICATION_PRODUCER, useValue: producer },
        {
          provide: NotificationService,
          useFactory: (p: NotificationProducer) => new NotificationService(p),
          inject: [NOTIFICATION_PRODUCER],
        },
      ],
      exports: [NotificationService],
    };
  }
}
