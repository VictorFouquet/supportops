import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        HealthModule,
        AuthModule.register(config),
        OrganizationsModule.register(config),
        CustomersModule.register(config),
        UsersModule.register(config),
      ],
    };
  }
}
