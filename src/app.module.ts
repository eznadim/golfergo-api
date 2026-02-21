import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { VisitorsModule } from './visitors/visitors.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
      ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    VisitorsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
