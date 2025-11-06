import * as WebSocket from 'ws';

export type WebSocketWithAuth = WebSocket.WebSocket & {
    userId?: string;
    gameLevel?: string;
};