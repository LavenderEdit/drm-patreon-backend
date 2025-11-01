import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
// Importamos los tipos desde la nueva ubicación
import type { FlatIdentity } from '../interface/FlatIdentity';
import type { SessionJwtPayload } from '../interface/SessionJwtPayload';
// Quitamos las importaciones rotas de 'patreon-api.ts'
import { type Oauth2StoredToken } from 'patreon-api.ts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly requiredTierIds: string[];

  constructor(
    private readonly patreonApi: PatreonApiService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Cargamos los IDs de los tiers requeridos desde el .env
    // .env debería tener: PATREON_REQUIRED_TIER_IDS=12345,67890
    const tierIds =
      this.configService.get<string>('PATREON_REQUIRED_TIER_IDS') ?? '';
    this.requiredTierIds = tierIds.split(',').filter(Boolean);

    if (this.requiredTierIds.length === 0) {
      this.logger.warn(
        'PATREON_REQUIRED_TIER_IDS no está configurado en .env. No se podrá validar ningún tier.',
      );
    }
  }

  /**
   * Punto de entrada principal para el callback de Patreon.
   * Maneja la lógica de las Partes 3.3, 3.4 y 3.5.
   */
  public async handlePatreonCallback(
    code: string,
    stateFromQuery: string,
    stateFromCookie: string | false,
  ): Promise<string> {
    this.logger.log('Iniciando callback de Patreon...');

    // 1. Validación CSRF (Parte 3.3)
    if (stateFromCookie === false || stateFromCookie !== stateFromQuery) {
      this.logger.error('Fallo en la validación CSRF: El estado no coincide.');
      throw new ForbiddenException(
        'Invalid OAuth state (CSRF validation failed)',
      );
    }
    this.logger.log('Validación CSRF exitosa.');

    // 2. Intercambio de Código (Parte 3.3)
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

    // 3. Verificación de Membresía (Parte 3.4)
    let identity: any; // <-- ARREGLO 1: Usamos 'any' porque los tipos no se exportan
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
    const authorizedTier = this.authorizeUser(flatIdentity);

    if (!authorizedTier) {
      this.logger.warn(
        `Autorización fallida para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Estado: ${flatIdentity.patronStatus}`,
      );
      throw new UnauthorizedException(
        'No eres un mecenas activo o no tienes el tier requerido.',
      );
    }

    this.logger.log(
      `Usuario autorizado: ${flatIdentity.email} (ID: ${flatIdentity.userId}) con tier: ${authorizedTier.title}`,
    );

    // 5. Generación de JWT (Parte 3.5)
    // Usamos el título del tier como el 'game_level'
    const payload: SessionJwtPayload = {
      sub: flatIdentity.userId,
      game_level: authorizedTier.title, // O un mapeo interno si se prefiere
    };

    // El JwtModule ya está configurado con secreto y expiración (60s)
    const sessionToken = this.jwtService.sign(payload);

    return sessionToken;
  }

  /**
   * Verifica que el usuario sea un mecenas activo y tenga un tier válido.
   */
  private authorizeUser(
    identity: FlatIdentity,
  ): { id: string; title: string } | null {
    // 1. Debe ser un mecenas activo
    if (identity.patronStatus !== 'active_patron') {
      return null;
    }

    // 2. Debe tener al menos un tier que esté en nuestra lista de requeridos
    const validTier = identity.tiers.find((tier) =>
      this.requiredTierIds.includes(tier.id),
    );

    return validTier || null;
  }

  /**
   * Convierte la compleja respuesta JSON:API en un objeto simple.
   */
  private flattenIdentityResponse(identity: any): FlatIdentity {
    const userData = identity.data;
    const included = identity.included || [];

    const membership = included.find((item: any) => item.type === 'member'); // <-- Usamos 'any'

    const tiers = (
      membership?.relationships?.currently_entitled_tiers?.data || []
    )
      .map((tierRef: any) => {
        // <-- Usamos 'any'
        return included.find(
          (item: any) => item.type === 'tier' && item.id === tierRef.id,
        ); // <-- Usamos 'any'
      })
      .filter(
        (tier): tier is { id: string; attributes: { title: string } } => !!tier,
      ) // <-- Tipo genérico
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
