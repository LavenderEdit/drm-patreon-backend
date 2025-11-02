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
   */
  async getTokens(code: string): Promise<Oauth2StoredToken> {
    // --- MÁS DEPURACIÓN ---
    this.logger.debug(
      `[getTokens] Intentando intercambiar código: "${code.substring(0, 10)}..."`,
    );
    // --- FIN DE LA DEPURACIÓN ---

    try {
      const storedToken = await this.baseClient.oauth.getOauthTokenFromCode(code);
      if (!storedToken) {
        // --- MÁS DEPURACIÓN ---
        this.logger.error('[getTokens] fetchToken devolvió undefined.');
        // --- FIN DE LA DEPURACIÓN ---
        throw new Error('Failed to fetch token from code (token is undefined)');
      }
      // --- MÁS DEPURACIÓN ---
      this.logger.debug('[getTokens] Token obtenido exitosamente.');
      // --- FIN DE LA DEPURACIÓN ---
      return storedToken;
    } catch (error) {
      // --- MÁS DEPURACIÓN: ¡ESTO ES LO MÁS IMPORTANTE! ---
      // Imprime el error COMPLETO, no solo el mensaje.
      this.logger.error(
        `[getTokens] Error COMPLETO al intercambiar: ${JSON.stringify(
          error,
          null,
          2,
        )}`,
      );
      // --- FIN DE LA DEPURACIÓN ---

      this.logger.error(`Error in getTokens: ${error.message}`);
      throw new UnauthorizedException(
        'Failed to exchange Patreon code for token.',
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
      const response = await userClient.fetchIdentity(query);
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

    this.creatorToken = {
      access_token: creatorAccessToken,
      refresh_token: creatorRefreshToken,
      expires_at: new Date(0).toISOString(),
      scope: 'campaigns campaigns.members',
      token_type: 'Bearer',
      expires_in: '0',
      expires_in_epoch: '0',
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
      try {
        const newStoredToken = await this.baseClient.oauth.refreshToken(
          this.creatorToken.refresh_token,
        );

        if (!newStoredToken) {
          throw new Error('Refresh token returned undefined');
        }

        this.creatorToken = newStoredToken;

        this.logger.warn(
          '¡Token de Creador Refrescado! Actualiza tu .env con estos valores para evitar fallos si el servidor reinicia:',
        );
        this.logger.warn(`NEW_ACCESS_TOKEN: ${newStoredToken.access_token}`);
        this.logger.warn(`NEW_REFRESH_TOKEN: ${newStoredToken.refresh_token}`);
      } catch (error) {
        this.logger.error(
          `¡FALLA CATASTRÓFICA! No se pudo refrescar el token del creador: ${error.message}`,
        );
        throw new UnauthorizedException(
          'Failed to refresh Patreon creator token.',
        );
      }
    }
    return new PatreonUserClientInstance(this.baseClient, this.creatorToken);
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