import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PatreonUserClient,
  PatreonOauthScope,
  QueryBuilder,
  PatreonUserClientInstance,
  Type,
  type PatreonClientOptions,
  type Oauth2StoredToken,
} from 'patreon-api.ts';

@Injectable()
export class PatreonApiService {
  private readonly logger = new Logger(PatreonApiService.name);
  private baseClient: PatreonUserClient;
  private creatorToken: Oauth2StoredToken;

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('PATREON_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>(
      'PATREON_CLIENT_SECRET',
    )!;
    const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI')!;

    // --- DEPURACIÓN (YA NO ES NECESARIA, PERO PUEDES DEJARLA) ---
    this.logger.debug('--- VERIFICANDO VARIABLES DE ENTORNO ---');
    this.logger.debug(`CLIENT_ID:     [${clientId}]`);
    this.logger.debug(`CLIENT_SECRET: [${clientSecret.substring(0, 5)}...]`);
    this.logger.debug(`REDIRECT_URI:  [${redirectUri}]`);
    this.logger.debug('------------------------------------------');
    // --- FIN DE LA DEPURACIÓN ---

    if (!clientId || !clientSecret) {
      throw new Error('Patreon client ID or secret not configured.');
    }

    const options: PatreonClientOptions = {
      oauth: {
        clientId: clientId,
        clientSecret: clientSecret,
        redirectUri: redirectUri,
        scopes: [
          PatreonOauthScope.Identity,
          PatreonOauthScope.IdentityEmail,
          PatreonOauthScope.IdentityMemberships,
          'campaigns',
          'campaigns.members',
        ],
      },
    };
    this.baseClient = new PatreonUserClient(options);
    this.logger.log('PatreonApiService (v2 client) initialized');
    this.initializeCreatorToken();
  }

  /**
 * Implementación de 4.2: Intercambio de Código por Tokens
 * Usa fetch directo en lugar de patreon-api.ts para evitar ERR_INVALID_URL
 */
  async getTokens(code: string): Promise<Oauth2StoredToken> {
    if (!code || code.trim().length === 0) {
      throw new UnauthorizedException('Authorization code is required');
    }

    try {
      this.logger.debug('[getTokens] Intercambiando código por token...');

      const tokenUrl = 'https://www.patreon.com/api/oauth2/token';
      const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
      const clientSecret = this.configService.get<string>(
        'PATREON_CLIENT_SECRET',
      );
      const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI');

      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
      });

      this.logger.debug(
        `[getTokens] POST a ${tokenUrl} con redirect_uri: ${redirectUri}`,
      );

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('[getTokens] Error de Patreon:', {
          status: response.status,
          error: errorData,
        });
        throw new Error(
          `Patreon API error (${response.status}): ${errorData.error}`,
        );
      }

      const tokenData = await response.json();

      const storedToken: Oauth2StoredToken = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(
          Date.now() + tokenData.expires_in * 1000,
        ).toISOString(),
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in.toString(),
        expires_in_epoch: Math.floor(
          (Date.now() + tokenData.expires_in * 1000) / 1000,
        ).toString(),
      };

      this.logger.log(
        '[getTokens] Token obtenido exitosamente.',
      );
      return storedToken;
    } catch (error) {
      this.logger.error('[getTokens] Error completo:', {
        error: error instanceof Error ? error.message : String(error),
        code: code.substring(0, 10) + '...',
      });

      throw new UnauthorizedException(
        'Failed to exchange Patreon code for token',
      );
    }
  }

  /**
   * Crea una instancia del cliente de usuario con el token proporcionado
   */
  private createClientInstance(
    token: Oauth2StoredToken,
  ): PatreonUserClientInstance {
    return new PatreonUserClientInstance(this.baseClient, token);
  }

  /**
   * Implementación de 4.3: Llama a GET /identity
   */
  async getUserIdentity(token: Oauth2StoredToken) {
    const userClient = this.createClientInstance(token);

    const query = QueryBuilder.identity
      .addRelationships([
        'memberships',
        'memberships.currently_entitled_tiers',
      ] as any)
      .setAttributes({
        user: ['full_name', 'email'],
        member: [
          'patron_status',
          'last_charge_date',
          'pledge_relationship_start',
        ],
        tier: ['title', 'amount_cents'],
      });

    try {
      this.logger.debug('[getUserIdentity] Solicitando identidad con membresías...');
      const response = await userClient.fetchIdentity(query);
      this.logger.debug('[getUserIdentity] Respuesta recibida:', {
        hasIncluded: !!response.included,
        includedLength: response.included?.length || 0,
        includedTypes: response.included?.map((item: any) => item.type) || [],
      });
      return response;
    } catch (error) {
      this.logger.error(`Error in getUserIdentity: ${error.message}`);
      throw new UnauthorizedException(
        'Failed to fetch user identity from Patreon.',
      );
    }
  }

  /**
   * Implementación de 4.4: Verificación de Suscripción del Usuario
   */
  async verifyUserSubscription(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    this.logger.log(
      `Verifying subscription for user ${userId} (via verifyUserSubscription)...`,
    );
    try {
      return await this.checkSubscriptionStatus(userId);
    } catch (error) {
      this.logger.error(
        `Failed to verify subscription for ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Inicializa el token del creador desde las variables de entorno
   */
  private initializeCreatorToken() {
    const creatorAccessToken = this.configService.get<string>(
      'PATREON_CREATOR_ACCESS_TOKEN',
    )!;
    const creatorRefreshToken = this.configService.get<string>(
      'PATREON_CREATOR_REFRESH_TOKEN',
    )!;

    if (!creatorAccessToken || !creatorRefreshToken) {
      throw new Error(
        'Patreon creator access token or refresh token not configured.',
      );
    }

    const expiresIn = 2592000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    this.creatorToken = {
      access_token: creatorAccessToken,
      refresh_token: creatorRefreshToken,
      expires_at: expiresAt.toISOString(),
      scope: 'campaigns campaigns.members',
      token_type: 'Bearer',
      expires_in: expiresIn.toString(),
      expires_in_epoch: Math.floor(expiresAt.getTime() / 1000).toString(),
    };
  }

  /**
 * Obtiene un cliente de creador válido, refrescando el token si es necesario
 */
  private async getValidCreatorClient(): Promise<PatreonUserClientInstance> {
    const now = new Date();
    const expiresAt = new Date(this.creatorToken.expires_at);

    if (expiresAt.getTime() - now.getTime() < 60000) {
      this.logger.log(
        'Creator token expired or nearing expiration. Refreshing...',
      );
      await this.refreshCreatorToken();
    }

    return new PatreonUserClientInstance(this.baseClient, this.creatorToken);
  }

  /**
   * Refresca el token del creador usando fetch directo
   */
  private async refreshCreatorToken(): Promise<void> {
    try {
      const tokenUrl = 'https://www.patreon.com/api/oauth2/token';
      const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
      const clientSecret = this.configService.get<string>(
        'PATREON_CLIENT_SECRET',
      );

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.creatorToken.refresh_token,
        client_id: clientId!,
        client_secret: clientSecret!,
      });

      // this.logger.debug('[refreshCreatorToken] Refrescando token del creador...');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.logger.error('[refreshCreatorToken] Error de Patreon:', errorData);
        throw new Error(
          `Patreon API error (${response.status}): ${errorData.error}`,
        );
      }

      const tokenData = await response.json();

      const expiresAt = new Date(
        Date.now() + tokenData.expires_in * 1000,
      );

      this.creatorToken = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt.toISOString(),
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in.toString(),
        expires_in_epoch: Math.floor(expiresAt.getTime() / 1000).toString(),
      };

      this.logger.log('[refreshCreatorToken] Token refrescado exitosamente.');

      this.logger.warn(
        'Actualiza tu .env con estos valores para evitar fallos si el servidor reinicia:',
      );
      this.logger.warn(`PATREON_CREATOR_ACCESS_TOKEN=${tokenData.access_token}`);
      this.logger.warn(`PATREON_CREATOR_REFRESH_TOKEN=${tokenData.refresh_token}`);
    } catch (error) {
      this.logger.error('[refreshCreatorToken] Error:', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new UnauthorizedException(
        'Failed to refresh Patreon creator token',
      );
    }
  }

  /**
   * Implementación de 5.3.b: Llama a GET /members/{userId}
   */
  async checkSubscriptionStatus(userId: string): Promise<boolean> {
    this.logger.log(`[Cron] Checking subscription for user: ${userId}`);

    try {
      const creatorClient = await this.getValidCreatorClient();

      const fields = {
        member: ['patron_status'],
      };
      const response = await creatorClient.fetchMember(userId, fields as any);

      const status = response.data.attributes.patron_status;
      const isActive = status === 'active_patron';

      if (!isActive) {
        this.logger.warn(
          `[Cron] User ${userId} is NO LONGER active. Status: ${status}`,
        );
      }
      return isActive;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        this.logger.warn(
          `[Cron] User ${userId} not found in campaign. Marking as inactive.`,
        );
        return false;
      }
      this.logger.error(
        `[Cron] Error checking subscription for ${userId}: ${error.message}`,
      );
      return true;
    }
  }

  /**
   * Método de prueba para el cron job (Versión A de TasksService)
   */
  async handleCronSubscriptionCheck(): Promise<void> {
    this.logger.log(
      '[Cron Job] Iniciando verificación de suscripciones en segundo plano...',
    );
    try {
      await this.getValidCreatorClient();
      this.logger.log(
        '[Cron Job] Lógica de verificación (usando token de creador) completada.',
      );
    } catch (error) {
      this.logger.error(
        `[Cron Job] Error durante la verificación: ${error.message}`,
      );
    }
  }
}