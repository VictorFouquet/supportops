import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({})
export class OrganizationsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: OrganizationsModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [OrganizationsController],
      providers: [OrganizationsService],
    };
  }
}
