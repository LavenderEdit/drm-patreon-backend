import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { JwtService } from '@nestjs/jwt';
import { SessionManagerService } from '../session-manager/session-manager.service';
import { ConfigService } from '@nestjs/config';
import { WebSocketWithAuth } from './ws.types';

@Injectable()
export class WsService implements OnModuleInit, OnModuleDestroy {
    private wss: WebSocket.Server;
    private readonly logger = new Logger(WsService.name);
    private readonly connectionMap: Map<WebSocketWithAuth, string> = new Map();

    constructor(
        private readonly jwtService: JwtService,
        private readonly sessionManager: SessionManagerService,
        private readonly configService: ConfigService,
    ) { }

    onModuleInit() {
        const wsPort = 3001;
        this.wss = new WebSocket.Server({ port: wsPort });
        this.logger.log(`WebSocket server iniciado en ws://0.0.0.0:${wsPort}`);

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) => this.logger.error('WS Server Error:', error.message));
    }

    onModuleDestroy() {
        this.wss.close();
        this.logger.log('WebSocket server cerrado.');
    }

    private handleConnection(ws: WebSocketWithAuth) {
        this.logger.log(`Cliente WebSocket conectado (ID: ${ws.url})`);

        ws.on('message', (data: WebSocket.RawData) => {
            if (ws.userId) {
                this.logger.debug(`Mensaje de ${ws.userId}: ${data.toString()}`);
                return;
            }

            try {
                const message = JSON.parse(data.toString());

                if (message.type === 'auth' && message.token) {
                    const payload = this.jwtService.verify(message.token);

                    ws.userId = payload.sub;
                    ws.gameLevel = payload.game_level;

                    this.logger.log(`User autenticado: ${ws.userId} (Level: ${ws.gameLevel})`);

                    this.sessionManager.registerConnection(ws.userId, ws);
                    this.connectionMap.set(ws, ws.userId);

                    ws.send(JSON.stringify({
                        type: 'authorization',
                        status: 'authorized',
                        access: ws.gameLevel,
                    }));
                } else {
                    this.sendErrorAndClose(ws, 400, 'Authentication required or invalid message format.');
                }
            } catch (err) {
                this.logger.warn(`Error de autenticación: ${err.message}`);
                this.sendErrorAndClose(ws, 401, 'Unauthorized: Invalid or expired token.');
            }
        });

        ws.on('close', () => {
            const userId = this.connectionMap.get(ws);
            if (userId) {
                this.sessionManager.removeConnection(userId);
                this.connectionMap.delete(ws);
            } else {
                this.logger.log('Cliente no autenticado desconectado.');
            }
        });

        ws.on('error', (err) => {
            this.logger.error(`Error en la conexión WS: ${err.message}`);
        });
    }

    public sendErrorAndClose(ws: WebSocketWithAuth, code: number, message: string): void {
        const payload = { type: 'error', code, message };
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(payload));
            }
        } catch (e) {
            this.logger.warn(`Error al enviar mensaje de cierre: ${e.message}`);
        }
        ws.close(1008, message);
    }
}