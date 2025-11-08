import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import { SessionManagerService } from '../session-manager/session-manager.service';
import * as WebSocket from 'ws';
import { WebSocketWithAuth } from '../ws/ws.types';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly patreonApi: PatreonApiService,
  ) { }

  @Cron('0 */15 * * * *')
  async handleSubscriptionVerification() {
    const activeSessions: Map<string, WebSocketWithAuth> =
      this.sessionManager.getAllConnections();

    this.logger.log(
      `[DEBUG][Cron] Sesiones autenticadas activas: ${Array.from(activeSessions.keys())}`,
    );

    if (activeSessions.size === 0) {
      this.logger.log('[Cron] No hay sesiones autenticadas para verificar.');
      return;
    }

    this.logger.log(
      `[Cron] Verificando ${activeSessions.size} sesiones autenticadas...`,
    );
    for (const [userId, ws] of activeSessions.entries()) {
      if (ws.readyState !== WebSocket.OPEN) {
        this.sessionManager.removeConnection(ws);
        continue;
      }

      try {
        const isActive = await this.patreonApi.checkSubscriptionStatus(userId);
        if (!isActive) {
          this.logger.warn(
            `[Cron] User ${userId} subscription is no longer active. Disconnecting.`,
          );

          ws.send(
            JSON.stringify({
              type: 'error',
              code: 4002,
              message: 'Subscription expired or no longer active.',
            }),
          );

          ws.close(4002, 'Subscription expired or no longer active.');

          this.sessionManager.removeConnection(ws);
        }
      } catch (error) {
        this.logger.error(
          `[Cron] Error al verificar a ${userId}: ${error.message}`,
        );
      }
    }
  }
}