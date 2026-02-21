import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseJwtGuard } from './jwt.guard';

@Module({
  imports: [ConfigModule],           // uses the global ConfigModule you enabled
  providers: [SupabaseJwtGuard],     // makes the guard injectable
  exports: [SupabaseJwtGuard],       // lets other modules use it
})
export class AuthModule {}