import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import type { FlatIdentity } from '../interface/FlatIdentity';
import type { SessionJwtPayload } from '../interface/SessionJwtPayload';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly patreonApi: PatreonApiService,
    private readonly jwtService: JwtService,
  ) { }

  /**
   * Procesa el callback de Patreon después de validación CSRF.
   * La validación CSRF ocurre en AuthController
   */
  public async handlePatreonCallback(code: string): Promise<string> {
    this.logger.log('Procesando callback de Patreon...');

    // 1. Intercambio de Código
    let tokens;
    try {
      tokens = await this.patreonApi.getTokens(code);
      this.logger.log('Token de acceso obtenido.');
    } catch (error) {
      this.logger.error(
        `Fallo al intercambiar el código: ${error.message}`,
      );
      throw new UnauthorizedException(
        'No se pudo intercambiar el código de Patreon.',
      );
    }

    // 2. Obtención de Identidad del Usuario
    let identity: any;
    try {
      identity = await this.patreonApi.getUserIdentity(tokens);
      this.logger.log('Identidad del usuario obtenida.');
    } catch (error) {
      this.logger.error(`Fallo al obtener la identidad: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo obtener la identidad del usuario.',
      );
    }

    // 3. Aplanar y Validar Membresía
    const flatIdentity = this.flattenIdentityResponse(identity);
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

    // 4. Generación de JWT
    const payload: SessionJwtPayload = {
      sub: flatIdentity.userId,
      game_level: primaryTier.title,
    };

    const sessionToken = this.jwtService.sign(payload);
    this.logger.log(`JWT generado para usuario ${flatIdentity.userId}`);

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

    // 2. Si tiene tiers, devuelve el primero
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

    // this.logger.debug('[flattenIdentityResponse] Respuesta completa de Patreon:', {
    //   userData: JSON.stringify(userData, null, 2),
    //   includedLength: included.length,
    //   includedTypes: included.map((item: any) => item.type),
    // });

    const membership = included.find((item: any) => item.type === 'member');

    // this.logger.debug('[flattenIdentityResponse] Membresía encontrada:', {
    //   exists: !!membership,
    //   membership: membership ? JSON.stringify(membership, null, 2) : 'NO ENCONTRADA',
    // });

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


    const flatIdentity: FlatIdentity = {
      userId: userData.id,
      fullName: userData.attributes.full_name,
      email: userData.attributes.email,
      isMember: !!membership,
      patronStatus: membership?.attributes?.patron_status || null,
      tiers: tiers,
    };

    this.logger.debug('[flattenIdentityResponse] Objeto aplanado final:', flatIdentity);
    return flatIdentity;
  }
}
