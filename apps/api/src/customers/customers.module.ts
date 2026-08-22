import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

@Module({})
export class CustomersModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: CustomersModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [CustomersController],
      providers: [CustomersService],
    };
  }
}
