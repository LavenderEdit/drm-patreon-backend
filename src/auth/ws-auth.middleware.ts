import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

export type SocketWithAuth = Socket & {
    user: { sub: string; game_level: string };
};

export const WsAuthMiddleware = (jwtService: JwtService) => {
    return (client: SocketWithAuth, next) => {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                throw new WsException('Unauthorized: No token provided.');
            }

            const payload = jwtService.verify(token);
            client.user = payload;
            next();
        } catch (error) {
            next(new WsException('Unauthorized: Invalid token.'));
        }
    };
};