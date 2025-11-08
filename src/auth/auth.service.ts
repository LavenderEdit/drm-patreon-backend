import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import type { FlatIdentity } from '../interface/FlatIdentity';
import { ConfigService } from '@nestjs/config';
import type { SessionJwtPayload } from '../interface/SessionJwtPayload';

export interface HandlePatreonCallbackResult {
  sessionToken: string;
  identity: FlatIdentity;
  activeTier: { id: string; title: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly patreonApi: PatreonApiService,
    private readonly jwtService: JwtService,
    private readonly ConfigService: ConfigService,
  ) { }

  public async handlePatreonCallback(
    code: string,
  ): Promise<HandlePatreonCallbackResult> {
    this.logger.log('Procesando callback de Patreon (Flujo PUSH)...');

    let tokens;
    try {
      tokens = await this.patreonApi.getTokens(code);
      this.logger.log('Token de acceso obtenido.');
    } catch (error) {
      this.logger.error(`Fallo al intercambiar el código: ${error.message}`);
      throw new UnauthorizedException(
        'No se pudo intercambiar el código de Patreon.',
      );
    }

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

    const flatIdentity = this.flattenIdentityResponse(identity);

    if (flatIdentity.patronStatus !== 'active_patron') {
      this.logger.warn(
        `Autorización fallida para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Estado: ${flatIdentity.patronStatus}`,
      );
      throw new UnauthorizedException('No eres un mecenas activo.');
    }

    const allowedTierIdsEnv =
      this.ConfigService.get<string>('PATREON_ALLOWED_TIER_IDS') || '';
    const allowedTierIds = allowedTierIdsEnv.split(',');

    const activeTier = flatIdentity.tiers.find((userTier) =>
      allowedTierIds.includes(userTier.id),
    );

    if (!activeTier) {
      this.logger.warn(
        `Acceso denegado para ${flatIdentity.email} (ID: ${flatIdentity.userId}). Sus tiers [${flatIdentity.tiers.map((t) => t.id).join(', ')}] no están en la lista de permitidos.`,
      );
      throw new UnauthorizedException(
        'Tu nivel de mecenas no tiene acceso a este contenido por el momento.',
      );
    }

    const gameAccessLevel = activeTier.title;
    this.logger.log(
      `Usuario autorizado: ${flatIdentity.email} (ID: ${flatIdentity.userId}) con nivel: ${gameAccessLevel}`,
    );

    const payload: SessionJwtPayload = {
      sub: flatIdentity.userId,
      game_level: gameAccessLevel,
    };

    const sessionToken = this.jwtService.sign(payload);
    this.logger.log(`JWT generado para usuario ${flatIdentity.userId}`);

    return { sessionToken, identity: flatIdentity, activeTier };
  }

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
