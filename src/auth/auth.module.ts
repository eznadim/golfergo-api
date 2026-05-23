import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '../supabase/supabase.module';
import { AppAuthGuard } from './app-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigModule, SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AppAuthGuard],
  exports: [AuthService, AppAuthGuard],
})
export class AuthModule {}
