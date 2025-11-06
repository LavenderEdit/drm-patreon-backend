import { Injectable, Logger } from '@nestjs/common';
import * as WebSocket from 'ws'; 
import { WebSocketWithAuth } from '../ws/ws.types';

@Injectable()
export class SessionManagerService {
    private readonly logger = new Logger(SessionManagerService.name);
    // CAMBIO: Usamos WebSocketWithAuth
    private readonly sessions: Map<string, WebSocketWithAuth> = new Map();

    registerConnection(userId: string, socket: WebSocketWithAuth): void {
        const oldSocket = this.sessions.get(userId);
        this.logger.log(`[DEBUG] Registrando conexión para ${userId}`); 

        if (oldSocket) {
            this.logger.warn(
                `Detectada nueva conexión para ${userId}. Desconectando sesión antigua.`,
            );
            
            // CAMBIO: Lógica de ws.send() y ws.close()
            if (oldSocket.readyState === WebSocket.OPEN) {
                oldSocket.send(JSON.stringify({
                    type: 'error',
                    code: 4001,
                    message: 'New session initiated',
                }));
            }
            // 1008 = Policy Violation (reemplaza socket.disconnect(true))
            oldSocket.close(4001, 'New session initiated'); 
            this.removeConnection(userId);
        }

        this.sessions.set(userId, socket);
        this.logger.log(`Conexión registrada para ${userId}`);
    }

    removeConnection(userId: string): void {
        // ... (el resto del código es el mismo)
        this.logger.log(`[DEBUG] Eliminando conexión para ${userId}`);
        if (this.sessions.has(userId)) {
            this.sessions.delete(userId);
            this.logger.log(`Conexión eliminada para ${userId}`);
        }
    }

    // CAMBIO: El retorno es WebSocketWithAuth
    getAllConnections(): Map<string, WebSocketWithAuth> {
        return this.sessions;
    }
}