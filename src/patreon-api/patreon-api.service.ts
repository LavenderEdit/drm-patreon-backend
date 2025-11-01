import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    PatreonUserClient,
    PatreonClientOptions,
    PatreonOauthScope,
    Oauth2StoredToken,
    QueryBuilder,
    PatreonUserClientInstance,
    Type,
    PatreonQuery,
} from 'patreon-api.ts';
type IdentityQuery = PatreonQuery<
    Type.User,
    'memberships',
    {
        'user': ('full_name' | 'email')[];
        'member': (
            | 'patron_status'
            | 'last_charge_date'
            | 'pledge_relationship_start'
        )[];
    },
    false
>;

@Injectable()
export class PatreonApiService {
    private readonly logger = new Logger(PatreonApiService.name);

    private baseClient: PatreonUserClient;

    constructor(private readonly configService: ConfigService) {
        const clientId = this.configService.get<string>('PATREON_CLIENT_ID')!;
        const clientSecret = this.configService.get<string>('PATREON_CLIENT_SECRET')!;
        const redirectUri = this.configService.get<string>('PATREON_REDIRECT_URI')!;

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
                ],
            },
        };
        this.baseClient = new PatreonUserClient(options);
        this.logger.log('PatreonApiService (v2 client) initialized');
    }

    async getTokens(code: string): Promise<Oauth2StoredToken> {
        try {
            const storedToken = await this.baseClient.fetchToken(code);
            if (!storedToken) {
                throw new Error('Failed to fetch token from code (token is undefined)');
            }
            return storedToken;
        } catch (error) {
            this.logger.error(`Error in getTokens: ${error.message}`);
            throw new UnauthorizedException('Failed to exchange Patreon code for token.');
        }
    }

    private createClientInstance(token: Oauth2StoredToken): PatreonUserClientInstance {
        return new PatreonUserClientInstance(this.baseClient, token);
    }

    async getUserIdentity(token: Oauth2StoredToken) {
        const userClient = this.createClientInstance(token);

        const query = QueryBuilder.identity
            .addRelationships(['memberships'])
            .setAttributes({
                'user': ['full_name', 'email'],

                'member': ['patron_status', 'last_charge_date', 'pledge_relationship_start'],

                'tier': ['title', 'amount_cents'],
            });
        try {
            const response = await userClient.fetchIdentity(query as IdentityQuery);
            return response;
        } catch (error) {
            this.logger.error(`Error in getUserIdentity: ${error.message}`);
            throw new UnauthorizedException('Failed to fetch user identity from Patreon.');
        }
    }

    async verifyUserSubscription(userId: string, refreshToken: string): Promise<boolean> {
        this.logger.log(`Verifying subscription for user ${userId}...`);
        try {
            return true;
        } catch (error) {
            this.logger.error(`Failed to verify subscription for ${userId}: ${error.message}`);
            return false;
        }
    }
}
