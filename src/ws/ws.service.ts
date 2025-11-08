import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { JwtService } from '@nestjs/jwt';
import { SessionManagerService } from '../session-manager/session-manager.service';
import { ConfigService } from '@nestjs/config';
import { WebSocketWithAuth } from './ws.types';

@Injectable()
export class WsService implements OnModuleDestroy {
    private wss: WebSocket.Server;
    private readonly logger = new Logger(WsService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly sessionManager: SessionManagerService,
        private readonly configService: ConfigService,
    ) { }

    public initialize(server: any) {
        this.logger.log('Adjuntando servidor WebSocket al servidor HTTP...');
        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) =>
            this.logger.error('WS Server Error:', error.message),
        );
        this.logger.log(`WebSocket server adjuntado exitosamente.`);
    }

    onModuleDestroy() {
        if (this.wss) {
            this.wss.close();
            this.logger.log('WebSocket server cerrado.');
        }
    }

    private handleConnection(ws: WebSocketWithAuth) {
        this.logger.log('Nuevo cliente conectado. Esperando registro...');

        ws.on('message', (data: WebSocket.RawData) => {
            this.handleMessage(ws, data);
        });

        ws.on('close', () => {
            this.handleDisconnect(ws);
        });

        ws.on('error', (err) => {
            this.logger.error(`Error en la conexión WS: ${err.message}`);
        });
    }

    private async handleMessage(ws: WebSocketWithAuth, data: WebSocket.RawData) {
        let message: { type: string;[key: string]: any };
        try {
            message = JSON.parse(data.toString());
        } catch (error) {
            this.logger.warn('Mensaje WS malformado recibido', data.toString());
            ws.terminate();
            return;
        }

        switch (message.type) {
            case 'register':
                const temp_id = message.temp_id as string;
                if (!temp_id || typeof temp_id !== 'string' || temp_id.length < 10) {
                    this.logger.warn('Registro fallido: temp_id inválido', temp_id);
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid temp_id' }));
                    ws.terminate();
                    return;
                }

                this.logger.log(`Cliente registrado con temp_id: ${temp_id}`);
                this.sessionManager.registerConnection(temp_id, ws);
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            default:
                this.logger.warn('Tipo de mensaje WS no reconocido', message.type);
        }
    }

    private handleDisconnect(ws: WebSocketWithAuth) {
        this.logger.log('Cliente desconectado.');
        this.sessionManager.removeConnection(ws);
    }

    public async pushAuthData(
        temp_id: string,
        payload: {
            token: string;
            email: string;
            userId: string;
            gameLevel: string;
        },
    ) {
        this.logger.log(
            `Intentando PUSH de datos de autenticación a temp_id: ${temp_id}`,
        );

        const ws = this.sessionManager.authenticateAndRemapSession(temp_id, payload);

        if (ws) {
            const pushPayload = {
                type: 'auth_data',
                token: payload.token,
                email: payload.email,
            };
            ws.send(JSON.stringify(pushPayload));
            this.logger.log(
                `Éxito: PUSH de auth_data enviado a userId ${payload.userId}`,
            );
        } else {
            this.logger.warn(
                `Fallo de PUSH: El socket para temp_id ${temp_id} ya no existe.`,
            );
        }
    }
}