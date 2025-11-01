// src/auth/auth.controller.ts
import { Controller, Get, Res, Req } from '@nestjs/common';
import { type FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly configService: ConfigService) {}

  @Get('patreon/redirect')
  patreonRedirect(@Res() reply: FastifyReply) {
    const state = randomBytes(16).toString('hex');
    const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
    const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI');

    // El scope incluye la identidad del usuario y sus membresías
    const scope = encodeURIComponent(
      'identity identity[email] identity.memberships',
    );

    const patreonAuthUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

    reply
      .setCookie('patreon_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Usar 'secure' en producción
        path: '/',
        maxAge: 300, // 5 minutos
        signed: true,
      })
      .status(302) // <-- Establece el código de estado aquí
      .redirect(patreonAuthUrl); // <-- Y aquí solo pasas la URL (string)
  }
  //... otros métodos
}
