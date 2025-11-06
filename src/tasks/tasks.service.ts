import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PatreonApiService } from '../patreon-api/patreon-api.service';
import { SessionManagerService } from '../session-manager/session-manager.service';


@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly patreonApi: PatreonApiService,
  ) { }

  @Cron('0 */15 * * * *') // Cada 15 min
  async handleSubscriptionVerification() {
    this.logger.log(`[DEBUG][Cron] Sesiones activas: ${Array.from(this.sessionManager.getAllConnections().keys())}`);
    const activeSessions = this.sessionManager.getAllConnections();
    if (activeSessions.size === 0) {
      this.logger.log('[Cron] No hay sesiones activas para verificar.');
      return;
    }

    this.logger.log(`[Cron] Verificando ${activeSessions.size} sesiones...`);
    for (const [userId, socket] of activeSessions.entries()) {
      try {
        const isActive = await this.patreonApi.checkSubscriptionStatus(userId);
        if (!isActive) {
          this.logger.warn(
            `[Cron] User ${userId} (${socket.id}) subscription is no longer active. Disconnecting.`,
          );

          socket.emit('error', {
            code: 4002,
            message: 'Subscription expired or no longer active.',
          });

          socket.disconnect(true);
        }
      } catch (error) {
        this.logger.error(`[Cron] Error al verificar a ${userId}: ${error.message}`);
      }
    }
  }
}
