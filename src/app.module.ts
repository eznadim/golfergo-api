import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { VisitorsModule } from './visitors/visitors.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseModule } from './supabase/supabase.module';
import { HelloModule } from './hello/hello.module';

@Module({
  imports: [
      ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    VisitorsModule,
    HelloModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
