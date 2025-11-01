import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PatreonApiModule } from './patreon-api/patreon-api.module';
import { EventsModule } from './events/events.module';
import { SessionManagerModule } from './session-manager/session-manager.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    PatreonApiModule,
    SessionManagerModule,
    TasksModule,
    EventsModule,],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
