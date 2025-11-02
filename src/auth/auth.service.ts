import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import type { FlatIdentity } from '../interface/FlatIdentity';
import type { SessionJwtPayload } from '../interface/SessionJwtPayload';
import { type Oauth2StoredToken } from 'patreon-api.ts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly patreonApi: PatreonApiService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Punto de entrada principal para el callback de Patreon.
   */
  public async handlePatreonCallback(
    code: string,
    stateFromQuery: string,
    stateFromCookie: string | false,
  ): Promise<string> {
    this.logger.log('Iniciando callback de Patreon...');

    // 1. Validación CSRF
    if (stateFromCookie === false || stateFromCookie !== stateFromQuery) {
      this.logger.error('Fallo en la validación CSRF: El estado no coincide.');
      throw new ForbiddenException(
        'Invalid OAuth state (CSRF validation failed)',
      );
    }
    this.logger.log('Validación CSRF exitosa.');

    // 2. Intercambio de Código
    let tokens: Oauth2StoredToken;
    try {
      tokens = await this.patreonApi.getTokens(code);
    } catch (error) {
      this.logger.error(`Fallo al intercambiar el código: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo intercambiar el código de Patreon.',
      );
    }
    this.logger.log('Token de acceso obtenido.');

    // 3. Verificación de Membresía
    let identity: any;
    try {
      identity = await this.patreonApi.getUserIdentity(tokens);
    } catch (error) {
      this.logger.error(`Fallo al obtener la identidad: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo obtener la identidad del usuario.',
      );
    }

    // 4. Aplanar y Autorizar
    const flatIdentity = this.flattenIdentityResponse(identity); // <-- Esto funcionará
    const primaryTier = this.getPrimaryTier(flatIdentity);

    if (!primaryTier) {
      this.logger.warn(
        `Autorización fallida para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Estado: ${flatIdentity.patronStatus}`,
      );
      throw new UnauthorizedException(
        'No eres un mecenas activo o no tienes un tier válido.',
      );
    }

    this.logger.log(
      `Usuario autorizado: ${flatIdentity.email} (ID: ${flatIdentity.userId}) con tier: ${primaryTier.title}`,
    );

    // 5. Generación de JWT
    // Usamos el título del tier como el 'game_level'
    const payload: SessionJwtPayload = {
      sub: flatIdentity.userId,
      game_level: primaryTier.title, // <-- GDevelop recibirá "Tier 20", "Tier 10", etc.
    };

    // El JwtModule ya está configurado con secreto y expiración (60s)
    const sessionToken = this.jwtService.sign(payload);

    return sessionToken;
  }

  /**
   * Verifica que el usuario sea un mecenas activo y devuelve su tier principal.
   */
  private getPrimaryTier(
    identity: FlatIdentity,
  ): { id: string; title: string } | null {
    // 1. Debe ser un mecenas activo
    if (identity.patronStatus !== 'active_patron') {
      return null;
    }

    // 2. Si tiene tiers, devuelve el primero.
    if (identity.tiers.length > 0) {
      return identity.tiers[0];
    }

    // 3. Si es un mecenas activo pero sin tier
    return { id: 'active_patron', title: 'Patron' };
  }

  /**
   * Convierte la compleja respuesta JSON:API en un objeto simple.
   */
  private flattenIdentityResponse(identity: any): FlatIdentity {
    const userData = identity.data;
    const included = identity.included || [];

    const membership = included.find((item: any) => item.type === 'member');

    const tiers = (
      membership?.relationships?.currently_entitled_tiers?.data || []
    )
      .map((tierRef: any) => {
        return included.find(
          (item: any) => item.type === 'tier' && item.id === tierRef.id,
        );
      })
      .filter(
        (tier): tier is { id: string; attributes: { title: string } } => !!tier,
      )
      .map((tier) => ({
        id: tier.id,
        title: tier.attributes.title,
      }));

    return {
      userId: userData.id,
      fullName: userData.attributes.full_name,
      email: userData.attributes.email,
      isMember: !!membership,
      patronStatus: membership?.attributes?.patron_status || null,
      tiers: tiers,
    };
  }
}
