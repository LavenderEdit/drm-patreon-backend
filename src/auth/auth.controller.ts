import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  Query,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AppService } from '../app.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly appService: AppService,
  ) { }

  @Get('patreon/redirect')
  patreonRedirect(
    @Res() reply: FastifyReply,
    @Query('platform') platformQuery: string,
  ) {
    const platform = platformQuery === 'mobile' ? 'mobile' : 'desktop';
    const csrfState = randomBytes(16).toString('hex');
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
    @Query('state') state: string,
  ) {
    this.logger.log('=== INICIANDO CALLBACK ===');

    if (!code) {
      throw new ForbiddenException('Authorization code is required');
    }

    const signedStateCookie = req.cookies['patreon_oauth_state'];
    if (!signedStateCookie) {
      const htmlError = this.appService.getAuthErrorHtml(
        'No se encontró la cookie de estado (CSRF). Su sesión puede haber expirado. Por favor, intente iniciar sesión de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    const { value: cookieData, valid } = reply.unsignCookie(signedStateCookie);
    if (!valid) {
      const htmlError = this.appService.getAuthErrorHtml(
        'Cookie de estado inválida. Por favor, intente iniciar sesión de nuevo.',
      ); //
      reply.type('text/html; charset=utf-8').status(403).send(htmlError);
      return;
    }

    const [stateFromCookie, platform] = cookieData.split(':');

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

    reply.clearCookie('patreon_oauth_state', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    try {
      const { sessionToken, identity, activeTier } =
        await this.authService.handlePatreonCallback(code);

      const htmlSuccess = this.appService.getAuthSuccessHtml({
        fullName: identity.fullName,
        tierTitle: activeTier.title
      });

      reply.type('text/html; charset=utf-8').status(200).send(htmlSuccess);
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : 'Error de autenticación desconocido.';

      this.logger.warn(`Autorización fallida: ${errorMessage}`);
      const htmlError = this.appService.getAuthErrorHtml(errorMessage);
      reply.type('text/html; charset=utf-8').status(401).send(htmlError);
    }
  }

  @Post('/api/latest-token')
  async findJwtTokenByEmail(@Body('email') email: string) {
    const token = await this.authService.getLastJwtForEmail(email);
    if (!token) throw new NotFoundException('No hay una sesión para ese correo');
    return { token };
  }
}
