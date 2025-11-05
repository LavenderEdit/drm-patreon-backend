import {
  Controller,
  Get,
  Res,
  Req,
  Query,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) { }

  @Get('patreon/redirect')
  patreonRedirect(@Res() reply: FastifyReply) {
    const state = randomBytes(16).toString('hex');
    const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
    const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI');

    this.logger.debug('=== PATREON REDIRECT DEBUG ===');
    this.logger.debug(`clientId: ${clientId}`);
    this.logger.debug(`redirectUri: ${redirectUri}`);
    this.logger.debug(`state: ${state}`);

    const scope = encodeURIComponent(
      'identity identity[email] identity.memberships',
    );

    const patreonAuthUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

    this.logger.debug(`URL de Patreon: ${patreonAuthUrl}`);

    try {
      reply
        .setCookie('patreon_oauth_state', state, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 300,
          signed: true,
        })
        .status(302)
        .redirect(patreonAuthUrl);

      // this.logger.log('Cookie guardada y redirección iniciada');
    } catch (error) {
      // this.logger.error('Error al guardar cookie o redirigir:', error);
      reply.status(500).send({ error: 'Failed to initiate login' });
    }
  }

  @Get('patreon/callback')
  async patreonCallback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    this.logger.log('=== INICIANDO CALLBACK ===');

    // Validar código
    if (!code) {
      throw new ForbiddenException('Authorization code is required');
    }

    // Obtener y validar cookie de estado
    const signedState = req.cookies['patreon_oauth_state'];
    if (!signedState) {
      throw new ForbiddenException('No se encontró la cookie de estado (CSRF).');
    }

    const { value: stateFromCookie, valid } = reply.unsignCookie(signedState);
    if (!valid || state !== stateFromCookie) {
      throw new ForbiddenException('Estado CSRF inválido.');
    }

    this.logger.log('Validación CSRF exitosa.');

    try {
      const sessionToken = await this.authService.handlePatreonCallback(code);

      reply.clearCookie('patreon_oauth_state', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });

      const clientSuccessUrl = this.configService.get<string>('CLIENT_SUCCESS_URL');
      if (!clientSuccessUrl) {
        this.logger.error('CLIENT_SUCCESS_URL no está definida en el archivo .env');
        throw new Error('Configuración de redirección de cliente incompleta.');
     }
      const clientRedirectUrl = `${clientSuccessUrl}?token=${sessionToken}`;
      // this.logger.log('Autenticación exitosa, redirigiendo al cliente...');
      reply.status(302).redirect(clientRedirectUrl);
    } catch (error) {
      // this.logger.error(`Error: ${error.message}`);
      const errorRedirect =
        this.configService.get<string>('CLIENT_ERROR_URL') ??
        'my-game://auth?error=true';
      reply.status(302).redirect(errorRedirect);
    }
  }
}
