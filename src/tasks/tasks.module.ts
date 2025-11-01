import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PatreonApiModule } from '../patreon-api/patreon-api.module';
import { SessionManagerModule } from '../session-manager/session-manager.module';

@Module({
  imports: [
    PatreonApiModule,
    SessionManagerModule, 
  ],
  providers: [TasksService],
})
export class TasksModule {}