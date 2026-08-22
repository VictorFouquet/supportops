import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [HealthModule, AuthModule.register(config)],
    };
  }
}
