import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';
import { AppAuthGuard } from './app-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseJwtGuard } from './jwt.guard';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, SupabaseJwtGuard, AppAuthGuard],
  exports: [AuthService, SupabaseJwtGuard, AppAuthGuard],
})
export class AuthModule {}
