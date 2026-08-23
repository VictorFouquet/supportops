import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule as AuthCoreModule } from '@supportops/auth';
import type { AppConfig } from '@supportops/config';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { TicketCommentsService } from './ticket-comments.service.js';

@Module({})
export class TicketsModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: TicketsModule,
      imports: [AuthCoreModule.register({ secret: config.JWT_SECRET, expiresIn: '1h' })],
      controllers: [TicketsController],
      providers: [TicketsService, TicketCommentsService],
    };
  }
}
