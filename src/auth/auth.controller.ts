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
import { AppService } from '../app.service'; // <-- 1. IMPORTAMOS AppService

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly appService: AppService, // <-- 2. INYECTAMOS AppService
  ) {}

  @Get('patreon/redirect')
  patreonRedirect(
    @Res() reply: FastifyReply,
    // --- MODIFICACIÓN: Detectar plataforma ---
    @Query('platform') platformQuery: string,
  ) {
    // Detectar la plataforma (default a 'desktop')
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
          // Guardamos "estado:plataforma"
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
      );
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
      );
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    // Obtenemos el "estado:plataforma" de la cookie
    const { value: cookieData, valid } = reply.unsignCookie(signedStateCookie);
    if (!valid) {
      const htmlError = this.appService.getAuthErrorHtml(
        'Cookie de estado inválida. Por favor, intente iniciar sesión de nuevo.',
      );
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
      );
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
      const sessionToken = await this.authService.handlePatreonCallback(code);

      // ELEGIR LA URL DE ÉXITO CORRECTA
      const successUrlKey =
        platform === 'mobile'
          ? 'CLIENT_SUCCESS_URL_MOBILE'
          : 'CLIENT_SUCCESS_URL_DESKTOP';

      const clientSuccessUrl = this.configService.get<string>(successUrlKey);

      if (!clientSuccessUrl) {
        this.logger.error(
          `${successUrlKey} no está definida en el archivo .env`,
        );
        // Si la URL de éxito no está, mostramos error HTML
        const htmlError = this.appService.getAuthErrorHtml(
          `Configuración de redirección de cliente (${successUrlKey}) incompleta.`,
        );
        reply.type('text/html; charset=utf-8').status(500).send(htmlError);
        return;
      }

      const clientRedirectUrl = `${clientSuccessUrl}?token=${sessionToken}`;
      this.logger.log(
        `Autenticación exitosa, redirigiendo a: ${successUrlKey}`,
      );
      reply.status(302).redirect(clientRedirectUrl);
    } catch (error) {
      // --- 3. ¡AQUÍ ESTÁ LA MAGIA! ---
      // En lugar de redirigir, generamos y enviamos el HTML de error.

      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : 'Error de autenticación desconocido.';

      this.logger.warn(`Autorización fallida: ${errorMessage}`);

      // Usamos AppService para generar el HTML
      const htmlError = this.appService.getAuthErrorHtml(errorMessage);

      // Enviamos el HTML como respuesta
      reply.type('text/html; charset=utf-8').status(401).send(htmlError);
    }
  }
}
