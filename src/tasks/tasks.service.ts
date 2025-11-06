import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import { SessionManagerService } from '../session-manager/session-manager.service';
import * as WebSocket from 'ws';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly patreonApi: PatreonApiService,
  ) { }

  @Cron('0 */15 * * * *') // Cada 15 min
  async handleSubscriptionVerification() {
    const activeSessions = this.sessionManager.getAllConnections();
    this.logger.log(`[DEBUG][Cron] Sesiones activas: ${Array.from(activeSessions.keys())}`);

    if (activeSessions.size === 0) {
      this.logger.log('[Cron] No hay sesiones activas para verificar.');
      return;
    }

    this.logger.log(`[Cron] Verificando ${activeSessions.size} sesiones...`);
    for (const [userId, ws] of activeSessions.entries()) {
      // 💡 Comprobación de estado antes de la verificación para limpiar sesiones muertas
      if (ws.readyState !== WebSocket.OPEN) {
        this.sessionManager.removeConnection(userId);
        continue;
      }

      try {
        const isActive = await this.patreonApi.checkSubscriptionStatus(userId);
        if (!isActive) {
          this.logger.warn(
            `[Cron] User ${userId} subscription is no longer active. Disconnecting.`,
          );

          // CAMBIO: Usar send/close de ws puro
          ws.send(JSON.stringify({
            type: 'error',
            code: 4002,
            message: 'Subscription expired or no longer active.',
          }));

          // 4002 es un código de aplicación, no oficial de WS. Usamos 1008
          ws.close(4002, 'Subscription expired or no longer active.');

          this.sessionManager.removeConnection(userId);
        }
      } catch (error) {
        this.logger.error(`[Cron] Error al verificar a ${userId}: ${error.message}`);
      }
    }
  }
}