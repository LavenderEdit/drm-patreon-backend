import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Error 2: El módulo se importa sin el '.ts'
import { patreon, oauth } from 'patreon-api'; // Importamos 'patreon' y 'oauth'
import { Tokens } from 'patreon-api/dist/types/tokens'; // Tipo para los tokens

@Injectable()
export class PatreonApiService {
  // Este será el cliente OAuth
  private patreonOAuthClient;

  constructor(private configService: ConfigService) {
    const clientId = this.configService.get<string>('PATREON_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'PATREON_CLIENT_SECRET',
    );

    // Verificación de seguridad (importante)
    if (!clientId || !clientSecret) {
      throw new Error(
        'PATREON_CLIENT_ID o PATREON_CLIENT_SECRET no están definidos en .env',
      );
    }

    // Error 1: Esta es la forma moderna de inicializar el cliente de oauth
    this.patreonOAuthClient = oauth(clientId, clientSecret);
  }

  /**
   * Obtiene los tokens de acceso usando el código de autorización.
   * @param code - El código recibido de Patreon en el callback.
   * @param redirectUri - La URI de redirección exacta usada.
   * @returns Los tokens de acceso y refresh.
   */
  public async getTokens(code: string, redirectUri: string): Promise<Tokens> {
    try {
      console.log(
        'Solicitando tokens con código:',
        code.substring(0, 5) + '...',
      );
      return await this.patreonOAuthClient.getTokens(code, redirectUri);
    } catch (error) {
      console.error('Error al obtener tokens de Patreon:', error);
      throw new Error('No se pudieron obtener los tokens de Patreon.');
    }
  }

  /**
   * Crea un cliente de API de Patreon autenticado.
   * @param accessToken - El token de acceso del usuario.
   * @returns Un cliente de API listo para hacer peticiones.
   */
  public getApiClient(accessToken: string) {
    // Usamos 'patreon' (el cliente de API) con el token
    return patreon(accessToken);
  }
}
