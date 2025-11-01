import {
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionManagerService } from '../session-manager/session-manager.service';
import {
    SocketWithAuth,
    WsAuthMiddleware,
} from '../auth/ws-auth.middleware';

@WebSocketGateway({
    cors: {
        origin: '*', // Ajusta esto en producción
    },
})
export class EventsGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(EventsGateway.name);

    constructor(
        private readonly sessionManager: SessionManagerService,
        private readonly jwtService: JwtService,
    ) { }

    afterInit(server: Server) {
        server.use(WsAuthMiddleware(this.jwtService));
        this.logger.log('WebSocket Gateway Initialized with Auth Middleware.');
    }

    handleConnection(client: SocketWithAuth) {
        const userId = client.user.sub;
        const gameLevel = client.user.game_level;

        this.logger.log(`Cliente conectado: ${userId} (Socket: ${client.id})`);

        this.sessionManager.registerConnection(userId, client);

        client.emit('authorization', {
            status: 'authorized',
            access: gameLevel,
        });
    }

    handleDisconnect(client: SocketWithAuth) {
        if (client.user) {
            const userId = client.user.sub;
            this.logger.log(`Cliente desconectado: ${userId} (Socket: ${client.id})`);
            this.sessionManager.removeConnection(userId);
        } else {
            this.logger.log(
                `Cliente no autenticado desconectado (Socket: ${client.id})`,
            );
        }
    }
}