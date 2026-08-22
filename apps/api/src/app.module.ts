import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';

@Module({})
export class AppModule {
  static register(_config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [HealthModule],
    };
  }
}
