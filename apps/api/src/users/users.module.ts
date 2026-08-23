import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({})
export class UsersModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: UsersModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [UsersController],
      providers: [UsersService],
      exports: [UsersService],
    };
  }
}
