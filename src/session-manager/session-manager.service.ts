import { Injectable, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { WebSocketWithAuth } from '../ws/ws.types';

@Injectable()
export class SessionManagerService {
    private readonly logger = new Logger(SessionManagerService.name);

    private readonly sessions = new Map<string, WebSocketWithAuth>();

    private readonly socketIdToKey = new Map<string, string>();

    private socketCounter = 0;

    private getSocketId(ws: WebSocketWithAuth): string {
        if (!(ws as any)._internalId) {
            (ws as any)._internalId = `ws-${this.socketCounter++}`;
        }
        return (ws as any)._internalId;
    }

    public registerConnection(temp_id: string, ws: WebSocketWithAuth) {
        const existingConnection = this.sessions.get(temp_id);
        if (existingConnection) {
            this.logger.warn(
                `temp_id ${temp_id} ya estaba en uso. Desconectando sesión antigua.`,
            );
            existingConnection.close(
                4001,
                'Temporary ID collision. Old session terminated.',
            );
            this.removeConnection(existingConnection);
        }

        const socketId = this.getSocketId(ws);
        (ws as any).isAuthenticating = true;

        this.sessions.set(temp_id, ws);
        this.socketIdToKey.set(socketId, temp_id);

        this.logger.log(`Socket ${socketId} mapeado a temp_id: ${temp_id}`);
    }

    public removeConnection(ws: WebSocketWithAuth) {
        const socketId = (ws as any)._internalId;
        if (!socketId) {
            return;
        }

        const sessionKey = this.socketIdToKey.get(socketId);
        if (sessionKey) {
            this.sessions.delete(sessionKey);
            this.socketIdToKey.delete(socketId);
            this.logger.log(`Conexión ${socketId} (Key: ${sessionKey}) eliminada.`);
        } else {
            this.logger.warn(
                `No se encontró mapeo para el socket ${socketId} al desconectar.`,
            );
        }
    }

    public authenticateAndRemapSession(
        temp_id: string,
        identity: { userId: string; email: string; gameLevel: string },
    ): WebSocketWithAuth | null {
        const ws = this.sessions.get(temp_id);
        if (!ws) {
            this.logger.warn(
                `pushAuthData fallido: No se encontró socket para temp_id: ${temp_id}`,
            );
            return null;
        }
        const socketId = this.getSocketId(ws);
        const { userId, gameLevel } = identity;

        const existingUserConnection = this.sessions.get(userId);
        if (existingUserConnection) {
            this.logger.warn(
                `Usuario ${userId} ya tiene una sesión activa. Desconectando la antigua.`,
            );
            existingUserConnection.close(
                4001,
                'New session initiated from another location.',
            );
            this.removeConnection(existingUserConnection);
        }

        this.sessions.delete(temp_id);
        this.sessions.set(userId, ws);

        this.socketIdToKey.set(socketId, userId);

        ws.userId = userId;
        ws.gameLevel = gameLevel;
        (ws as any).isAuthenticating = false;

        this.logger.log(
            `RE-KEYING: temp_id ${temp_id} -> userId ${userId} para socket ${socketId}`,
        );

        return ws;
    }

    public getAllConnections(): Map<string, WebSocketWithAuth> {
        const authenticatedSessions = new Map<string, WebSocketWithAuth>();
        for (const [key, socket] of this.sessions.entries()) {
            if (socket.userId) {
                authenticatedSessions.set(key, socket);
            }
        }
        return authenticatedSessions;
    }

    public getConnectionByUserId(userId: string): WebSocketWithAuth | undefined {
        return this.sessions.get(userId);
    }
}