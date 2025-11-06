import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import type { FlatIdentity } from '../interface/FlatIdentity'; //
import { ConfigService } from '@nestjs/config';
import type { SessionJwtPayload } from '../interface/SessionJwtPayload'; //

// --- NUEVA INTERFAZ AÑADIDA ---
export interface HandlePatreonCallbackResult {
  sessionToken: string;
  identity: FlatIdentity;
  activeTier: { id: string; title: string };
}
// --- FIN DE LA NUEVA INTERFAZ ---

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwtTokensByEmail = new Map<string, string>();

  constructor(
    private readonly patreonApi: PatreonApiService,
    private readonly jwtService: JwtService,
    private readonly ConfigService: ConfigService,
  ) { }

  /**
   * Procesa el callback de Patreon después de validación CSRF.
   * La validación CSRF ocurre en AuthController
   */
  public async handlePatreonCallback(
    code: string,
  ): Promise<HandlePatreonCallbackResult> {
    this.logger.log('Procesando callback de Patreon...');

    // 1. Intercambio de Código
    let tokens;
    try {
      tokens = await this.patreonApi.getTokens(code); //
      this.logger.log('Token de acceso obtenido.');
    } catch (error) {
      this.logger.error(`Fallo al intercambiar el código: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo intercambiar el código de Patreon.',
      );
    }

    // 2. Obtención de Identidad del Usuario
    let identity: any;
    try {
      identity = await this.patreonApi.getUserIdentity(tokens); //
      this.logger.log('Identidad del usuario obtenida.');
    } catch (error) {
      this.logger.error(`Fallo al obtener la identidad: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo obtener la identidad del usuario.',
      );
    }

    // 3. Aplanar y Validar Membresía
    const flatIdentity = this.flattenIdentityResponse(identity);

    // 3.1. Primero, verificar que sea un mecenas activo
    if (flatIdentity.patronStatus !== 'active_patron') {
      //
      this.logger.warn(
        `Autorización fallida para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Estado: ${flatIdentity.patronStatus}`, //
      );
      throw new UnauthorizedException('No eres un mecenas activo.');
    }

    // 3.2. Cargar la lista de IDs permitidos desde el .env
    const allowedTierIdsEnv =
      this.ConfigService.get<string>('PATREON_ALLOWED_TIER_IDS') || '';
    const allowedTierIds = allowedTierIdsEnv.split(',');

    // --- LÓGICA DE VALIDACIÓN DE TIER ---

    // 3.3. Comprobar si *alguno* de los tiers del usuario está en nuestra lista de permitidos
    const activeTier = flatIdentity.tiers.find(
      (
        userTier, //
      ) => allowedTierIds.includes(userTier.id),
    );

    // 3.4. Bloquear si no se encontró un tier permitido
    if (!activeTier) {
      this.logger.warn(
        `Acceso denegado para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Sus tiers [${flatIdentity.tiers.map((t) => t.id).join(', ')}] no están en la lista de permitidos.`, //
      );
      throw new UnauthorizedException(
        'Tu nivel de mecenas no tiene acceso a este contenido por el momento.',
      );
    }

    // 3.5. Autorizado
    // Usamos el TÍTULO del tier para el game_level, es más descriptivo
    const gameAccessLevel = activeTier.title;
    this.logger.log(
      `Usuario autorizado: ${flatIdentity.email} (ID: ${flatIdentity.userId}) con nivel: ${gameAccessLevel}`, //
    );

    // 4. Generación de JWT con el Nivel de Acceso
    const payload: SessionJwtPayload = {
      //
      sub: flatIdentity.userId, //
      game_level: gameAccessLevel, // <-- Ahora es el título del tier
    };

    const sessionToken = this.jwtService.sign(payload);
    this.logger.log(`JWT generado para usuario ${flatIdentity.userId}`); //

    this.jwtTokensByEmail.set(flatIdentity.email, sessionToken);
    return { sessionToken, identity: flatIdentity, activeTier };
  }

  public async getLastJwtForEmail(email: string): Promise<string | null> {
    return this.jwtTokensByEmail.get(email) || null;
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

    const flatIdentity: FlatIdentity = {
      userId: userData.id,
      fullName: userData.attributes.full_name,
      email: userData.attributes.email,
      isMember: !!membership,
      patronStatus: membership?.attributes?.patron_status || null,
      tiers: tiers,
    };

    this.logger.debug(
      '[flattenIdentityResponse] Objeto aplanado final:',
      flatIdentity,
    );
    return flatIdentity;
  }
}
