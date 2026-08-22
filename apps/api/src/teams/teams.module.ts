import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({})
export class TeamsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: TeamsModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [TeamsController],
      providers: [TeamsService],
      exports: [TeamsService],
    };
  }
}
