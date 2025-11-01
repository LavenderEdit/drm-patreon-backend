import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  // ARREGLO 1: Estos se usan como VALORES, no solo como tipos
  PatreonUserClient,
  PatreonOauthScope,
  QueryBuilder,
  PatreonUserClientInstance,
  Type,

  // ARREGLO 1: Estos SÍ se usan solo como TIPOS
  type PatreonClientOptions,
  type Oauth2StoredToken,
  // type PatreonQuery, // <-- ARREGLO 2: Ya no necesitamos este tipo
} from 'patreon-api.ts';

// ARREGLO 2: Eliminamos la definición de 'IdentityQuery' porque estaba causando el error
// type IdentityQuery = ...

@Injectable()
export class PatreonApiService {
  private readonly logger = new Logger(PatreonApiService.name);

  // Este es el cliente base V2
  private baseClient: PatreonUserClient;

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('PATREON_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>(
      'PATREON_CLIENT_SECRET',
    )!;
    const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI')!;

    if (!clientId || !clientSecret) {
      throw new Error('Patreon client ID or secret not configured.');
    }

    // Opciones del cliente V2
    const options: PatreonClientOptions = {
      oauth: {
        clientId: clientId,
        clientSecret: clientSecret,
        redirectUri: redirectUri,
        scopes: [
          PatreonOauthScope.Identity,
          PatreonOauthScope.IdentityEmail,
          PatreonOauthScope.IdentityMemberships,
        ],
      },
    };
    this.baseClient = new PatreonUserClient(options);
    this.logger.log('PatreonApiService (v2 client) initialized');
  }

  /**
   * Intercambia un código de autorización por un token de acceso.
   * @param code El código recibido en el callback.
   * @returns El token almacenado.
   */
  async getTokens(code: string): Promise<Oauth2StoredToken> {
    try {
      const storedToken = await this.baseClient.fetchToken(code);
      if (!storedToken) {
        throw new Error('Failed to fetch token from code (token is undefined)');
      }
      return storedToken;
    } catch (error) {
      this.logger.error(`Error in getTokens: ${error.message}`);
      throw new UnauthorizedException(
        'Failed to exchange Patreon code for token.',
      );
    }
  }

  /**
   * Crea una instancia de cliente autenticada para un usuario específico.
   */
  private createClientInstance(
    token: Oauth2StoredToken,
  ): PatreonUserClientInstance {
    return new PatreonUserClientInstance(this.baseClient, token);
  }

  /**
   * Obtiene la identidad del usuario (datos y membresías)
   * @param token El token del usuario.
   */
  async getUserIdentity(token: Oauth2StoredToken) {
    const userClient = this.createClientInstance(token);

    // Usamos el QueryBuilder, mucho más limpio
    const query = QueryBuilder.identity
      .addRelationships([
        'memberships',
        'memberships.currently_entitled_tiers',
      ] as any) // <-- Mantenemos el 'as any' para la llamada
      .setAttributes({
        user: ['full_name', 'email'],
        member: [
          'patron_status',
          'last_charge_date',
          'pledge_relationship_start',
        ],
        tier: ['title', 'amount_cents'], // <-- DESCOMENTADO
      });

    try {
      // ARREGLO 3: Pasamos 'query' directamente sin el 'as IdentityQuery'
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
   * (Placeholder) Lógica para verificar la suscripción de un usuario.
   */
  async verifyUserSubscription(
    userId: string,
    refreshToken: string,
  ): Promise<boolean> {
    this.logger.log(`Verifying subscription for user ${userId}...`);
    try {
      // Aquí iría la lógica de refrescar el token si es necesario
      // y comprobar el 'patron_status' de la membresía
      return true; // Placeholder
    } catch (error) {
      this.logger.error(
        `Failed to verify subscription for ${userId}: ${error.message}`,
      );
      return false;
    }
  }
}
