import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@supportops/config';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({})
export class OrganizationsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: OrganizationsModule,
      imports: [AuthModule.register(config)],
      controllers: [OrganizationsController],
      providers: [OrganizationsService],
    };
  }
}
