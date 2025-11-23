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
    this.logger.log('Processing Patreon callback (PUSH Flow)...');

    let tokens;
    try {
      tokens = await this.patreonApi.getTokens(code);
      this.logger.log('Access token obtained.');
    } catch (error) {
      this.logger.error(`Failed to exchange code: ${error.message}`);
      throw new UnauthorizedException('Could not exchange Patreon code.');
    }

    let identity: any;
    try {
      identity = await this.patreonApi.getUserIdentity(tokens);
      this.logger.log('User identity obtained.');
    } catch (error) {
      this.logger.error(`Failed to get identity: ${error.message}`);
      throw new UnauthorizedException('Could not fetch user identity.');
    }

    const flatIdentity = this.flattenIdentityResponse(identity);

    if (flatIdentity.patronStatus !== 'active_patron') {
      this.logger.warn(
        `Auth failed for ${flatIdentity.email} (ID: ${flatIdentity.userId}). Status: ${flatIdentity.patronStatus}`,
      );
      throw new UnauthorizedException('You are not an active patron in any relevant campaign.');
    }

    const allowedTierIdsEnv =
      this.ConfigService.get<string>('PATREON_ALLOWED_TIER_IDS') || '';
    const allowedTierIds = allowedTierIdsEnv.split(',');

    const activeTier = flatIdentity.tiers.find((userTier) =>
      allowedTierIds.includes(userTier.id),
    );

    if (!activeTier) {
      this.logger.warn(
        `Access denied for ${flatIdentity.email} (ID: ${flatIdentity.userId}). Tiers [${flatIdentity.tiers.map((t) => t.id).join(', ')}] not in allowed list.`,
      );
      throw new UnauthorizedException(
        'Your patron tier does not have access to this content at this time.',
      );
    }

    const gameAccessLevel = activeTier.title;
    this.logger.log(
      `User authorized: ${flatIdentity.email} (ID: ${flatIdentity.userId}) with level: ${gameAccessLevel}`,
    );

    const payload: SessionJwtPayload = {
      sub: flatIdentity.userId,
      game_level: gameAccessLevel,
    };

    const sessionToken = this.jwtService.sign(payload);
    this.logger.log(`JWT generated for user ${flatIdentity.userId}`);

    return { sessionToken, identity: flatIdentity, activeTier };
  }

  private flattenIdentityResponse(identity: any): FlatIdentity {
    const userData = identity.data;
    const included = identity.included || [];

    const memberships = included.filter((item: any) => item.type === 'member');

    let allTiers: any[] = [];
    let globalPatronStatus: string | null = null;

    for (const membership of memberships) {
      const tierRefs = membership.relationships?.currently_entitled_tiers?.data || [];
      const memberTiers = tierRefs
        .map((tierRef: any) => {
          return included.find(
            (item: any) => item.type === 'tier' && item.id === tierRef.id,
          );
        })
        .filter((tier: any) => !!tier);

      allTiers = [...allTiers, ...memberTiers];

      const status = membership.attributes?.patron_status;
      if (status === 'active_patron') {
        globalPatronStatus = 'active_patron';
      } else if (!globalPatronStatus && status) {
        globalPatronStatus = status;
      }
    }

    const uniqueTiersMap = new Map();
    allTiers.forEach((tier) => {
      if (!uniqueTiersMap.has(tier.id)) {
        uniqueTiersMap.set(tier.id, {
          id: tier.id,
          title: tier.attributes.title,
        });
      }
    });

    const flatIdentity: FlatIdentity = {
      userId: userData.id,
      fullName: userData.attributes.full_name,
      email: userData.attributes.email,
      isMember: memberships.length > 0,
      patronStatus: globalPatronStatus,
      tiers: Array.from(uniqueTiersMap.values()),
    };

    this.logger.debug(
      '[flattenIdentityResponse] Flattened object (Multi-membership fix):',
      JSON.stringify(flatIdentity, null, 2),
    );

    return flatIdentity;
  }
}