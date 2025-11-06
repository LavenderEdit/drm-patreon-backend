// [Contenido del archivo: lavenderedit/drm-patreon-backend/drm-patreon-backend-1c7d7cdf75688d95935285c32e2f6cc9de3deec5/src/auth/auth.controller.ts]
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
import { AppService } from '../app.service'; //

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService, //
    private readonly appService: AppService, //
  ) {}

  @Get('patreon/redirect')
  patreonRedirect(
    @Res() reply: FastifyReply,
    // --- MODIFICACIÓN: Detectar plataforma ---
    @Query('platform') platformQuery: string,
  ) {
    const platform = platformQuery === 'mobile' ? 'mobile' : 'desktop';
    const csrfState = randomBytes(16).toString('hex');

    // Guardamos AMBOS datos en la cookie "estado:plataforma"
    const cookieData = `${csrfState}:${platform}`;

    const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
    const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI');

    this.logger.debug('=== PATREON REDIRECT DEBUG ===');
    this.logger.debug(`clientId: ${clientId}`);
    this.logger.debug(`redirectUri: ${redirectUri}`);
    this.logger.debug(`state (CSRF): ${csrfState}`);
    this.logger.debug(`platform: ${platform}`);

    const scope = encodeURIComponent(
      'identity identity[email] identity.memberships',
    );

    const patreonAuthUrl = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${csrfState}`;

    this.logger.debug(`URL de Patreon: ${patreonAuthUrl}`);

    try {
      reply
        .setCookie('patreon_oauth_state', cookieData, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 300,
          signed: true,
        })
        .status(302)
        .redirect(patreonAuthUrl);
    } catch (error) {
      // Si falla antes de redirigir, mostramos un HTML de error genérico
      const htmlError = this.appService.getAuthErrorHtml(
        'No se pudo iniciar el proceso de login. Intente de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(500).send(htmlError);
    }
  }

  @Get('patreon/callback')
  async patreonCallback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query('code') code: string,
    @Query('state') state: string, // Este 'state' viene de la URL de Patreon
  ) {
    this.logger.log('=== INICIANDO CALLBACK ===');

    if (!code) {
      throw new ForbiddenException('Authorization code is required');
    }

    const signedStateCookie = req.cookies['patreon_oauth_state'];
    if (!signedStateCookie) {
      // Si no hay cookie, mostramos el error HTML
      const htmlError = this.appService.getAuthErrorHtml(
        'No se encontró la cookie de estado (CSRF). Su sesión puede haber expirado. Por favor, intente iniciar sesión de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    // Obtenemos el "estado:plataforma" de la cookie
    const { value: cookieData, valid } = reply.unsignCookie(signedStateCookie);
    if (!valid) {
      const htmlError = this.appService.getAuthErrorHtml(
        'Cookie de estado inválida. Por favor, intente iniciar sesión de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    // Separamos el estado y la plataforma
    const [stateFromCookie, platform] = cookieData.split(':');

    // Validamos el CSRF (state de la URL vs state de la cookie)
    if (state !== stateFromCookie) {
      this.logger.warn(
        `Fallo de CSRF: URL state (${state}) vs Cookie state (${stateFromCookie})`,
      );
      const htmlError = this.appService.getAuthErrorHtml(
        'Estado CSRF inválido. No se pudo verificar la solicitud. Por favor, intente iniciar sesión de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    this.logger.log(
      `Validación CSRF exitosa. Plataforma detectada: ${platform}`,
    );

    // Limpiamos la cookie CSRF inmediatamente después de usarla
    reply.clearCookie('patreon_oauth_state', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    try {
      // --- ⬇️ LÓGICA DE ÉXITO MODIFICADA ⬇️ ---

      // 1. Obtenemos el token, la identidad y el tier validado
      const { sessionToken, identity, activeTier } =
        await this.authService.handlePatreonCallback(code); //

      this.logger.log(
        `Autenticación exitosa, mostrando página de éxito para: ${identity.fullName} (Tier: ${activeTier.title})`, //
      );

      // 2. Generamos el HTML de éxito
      const htmlSuccess = this.appService.getAuthSuccessHtml({
        fullName: identity.fullName, //
        tierTitle: activeTier.title,
        sessionToken: sessionToken,
      });

      // 3. Enviamos la página HTML
      reply.type('text/html; charset=utf-8').status(200).send(htmlSuccess);

      // --- ⬆️ FIN DE LA LÓGICA MODIFICADA ⬆️ ---
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : 'Error de autenticación desconocido.';

      this.logger.warn(`Autorización fallida: ${errorMessage}`);

      const htmlError = this.appService.getAuthErrorHtml(errorMessage); //

      reply.type('text/html; charset=utf-8').status(401).send(htmlError);
    }
  }
}
