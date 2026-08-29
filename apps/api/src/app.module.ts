import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { UsersModule } from './users/users.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import type { NotificationsModuleOptions } from './notifications/notifications.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig, opts: NotificationsModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        HealthModule,
        AuthModule.register(config),
        OrganizationsModule.register(config),
        CustomersModule.register(config),
        UsersModule.register(config),
        TeamsModule.register(config),
        TicketsModule.register(config, opts),
      ],
    };
  }
}
