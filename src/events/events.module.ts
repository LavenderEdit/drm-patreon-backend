import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { AuthModule } from '../auth/auth.module';
import { SessionManagerModule } from '../session-manager/session-manager.module';

@Module({
    imports: [
        AuthModule,
        SessionManagerModule,
    ],
    providers: [EventsGateway],
})
export class EventsModule { }