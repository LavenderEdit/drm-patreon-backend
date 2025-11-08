import { Module, forwardRef } from '@nestjs/common';
import { WsService } from './ws.service';
import { AuthModule } from '../auth/auth.module';
import { SessionManagerModule } from '../session-manager/session-manager.module';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [
        forwardRef(() => AuthModule),
        SessionManagerModule,
        ConfigModule
    ],
    providers: [WsService],
    exports: [WsService, SessionManagerModule],
})
export class WsModule { }