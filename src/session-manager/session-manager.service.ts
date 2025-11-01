import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class SessionManagerService {
    private readonly logger = new Logger(SessionManagerService.name);
    private readonly sessions: Map<string, Socket> = new Map();

    registerConnection(userId: string, socket: Socket): void {
        const oldSocket = this.sessions.get(userId);

        if (oldSocket && oldSocket.id !== socket.id) {
            this.logger.warn(
                `Detectada nueva conexión para ${userId}. Desconectando sesión antigua (${oldSocket.id}).`,
            );
            oldSocket.emit('error', {
                code: 4001,
                message: 'New session initiated',
            });
            oldSocket.disconnect(true);
        }

        this.sessions.set(userId, socket);
        this.logger.log(`Conexión registrada para ${userId} (Socket: ${socket.id})`);
    }

    removeConnection(userId: string): void {
        if (this.sessions.has(userId)) {
            this.sessions.delete(userId);
            this.logger.log(`Conexión eliminada para ${userId}`);
        }
    }

    getAllConnections(): Map<string, Socket> {
        return this.sessions;
    }
}