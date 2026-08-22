import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthPrincipal } from '@supportops/auth';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import type { MeDto } from './dto/me.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto.orgSlug, dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() principal: AuthPrincipal): Promise<MeDto> {
    return this.auth.me(principal.userId, principal.orgId);
  }
}
