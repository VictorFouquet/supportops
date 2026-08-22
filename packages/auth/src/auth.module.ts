import { Module, type DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({})
export class AuthModule {
  /** Configure JWT signing/verification and expose the guards. */
  static register(options: { secret: string; expiresIn: string }): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.register({
          secret: options.secret,
          signOptions: { expiresIn: options.expiresIn },
        }),
      ],
      providers: [JwtAuthGuard, RolesGuard],
      exports: [JwtAuthGuard, RolesGuard, JwtModule],
    };
  }
}
