import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({})
export class AuthModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [AuthController],
      providers: [AuthService],
      exports: [AuthCoreModule],
    };
  }
}
