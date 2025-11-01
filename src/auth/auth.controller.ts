import {
  Controller,
  Get,
  Res,
  Req,
  Query,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify'; // <-- ARREGLO 1
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService, // <-- 1. Inyectamos AuthService
  ) {}

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
        signed: true, // <-- ¡AQUÍ ESTÁ LA MAGIA!
      })
      .status(302) // <-- Establece el código de estado aquí
      .redirect(patreonAuthUrl); // <-- Y aquí solo pasas la URL (string)
  }

  // --- 2. IMPLEMENTACIÓN DEL NUEVO ENDPOINT DE CALLBACK (Flujo 1) ---
  @Get('patreon/callback')
  async patreonCallback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    this.logger.log(
      `Callback de Patreon recibido con código: ${code ? '...' : 'NULO'}`,
    );

    // 3. Validamos la cookie CSRF firmada
    const signedState = req.cookies['patreon_oauth_state'];
    if (!signedState) {
      throw new ForbiddenException(
        'No se encontró la cookie de estado (CSRF).',
      );
    }

    const { value: stateFromCookie, valid } = reply.unsignCookie(signedState);

    if (!valid) {
      throw new ForbiddenException('Cookie de estado (CSRF) inválida.');
    }

    try {
      // 4. Pasamos todo al AuthService para que maneje la lógica
      const sessionToken = await this.authService.handlePatreonCallback(
        code,
        state,
        stateFromCookie,
      );

      // 5. Limpiamos la cookie CSRF
      reply.clearCookie('patreon_oauth_state', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });

      // 6. Redirigimos al cliente del juego con el token (Parte 3.5)
      // (En producción, esto debería venir de una variable de entorno)
      const clientRedirectUrl = `my-game://auth?token=${sessionToken}`;
      this.logger.log('Autenticación exitosa, redirigiendo al cliente...');

      reply.status(302).redirect(clientRedirectUrl);
    } catch (error) {
      this.logger.error(
        `Fallo en el flujo de callback: ${error.message}`,
        error.stack,
      );
      // Redirigir a una página de error en el cliente
      const errorRedirect =
        this.configService.get<string>('CLIENT_ERROR_URL') ??
        'my-game://auth?error=true';
      reply.status(302).redirect(errorRedirect);
    }
  }
}
