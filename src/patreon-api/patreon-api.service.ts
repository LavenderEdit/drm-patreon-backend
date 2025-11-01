import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { Patreon } from 'patreon-api.ts';

@Injectable()
export class PatreonApiService {
    private patreonOAuthClient;

    constructor(private configService: ConfigService) {
        const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
        const clientSecret = this.configService.get<string>('PATREON_CLIENT_SECRET');
        // this.patreonOAuthClient = Patreon.oauth(clientId, clientSecret);
    }
}
