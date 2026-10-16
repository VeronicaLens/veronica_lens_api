import type {
  NotificationCandidate,
  NotificationDispatchPersistencePort,
} from './notification-dispatch.persistence.js';

export interface PushSendResult {
  ticketId: string | null;
}

export interface PushProviderPort {
  send(candidate: NotificationCandidate): Promise<PushSendResult>;
}

export interface NotificationDispatchReport {
  candidates: number;
  sent: number;
  failed: number;
  duplicates: number;
}

export class NotificationDispatchService {
  constructor(
    private readonly persistence: NotificationDispatchPersistencePort,
    private readonly provider: PushProviderPort,
  ) {}

  async dispatch(now = new Date()): Promise<NotificationDispatchReport> {
    const candidates = await this.persistence.findEligible(now);
    const report: NotificationDispatchReport = {
      candidates: candidates.length,
      sent: 0,
      failed: 0,
      duplicates: 0,
    };

    for (const candidate of candidates) {
      let deliveryId: string | null;
      try {
        deliveryId = await this.persistence.claimDelivery(candidate);
      } catch {
        report.failed += 1;
        continue;
      }
      if (!deliveryId) {
        report.duplicates += 1;
        continue;
      }

      try {
        const result = await this.provider.send(candidate);
        await this.persistence.markSent(deliveryId, result.ticketId);
        report.sent += 1;
      } catch (error) {
        report.failed += 1;
        try {
          await this.persistence.markFailed(deliveryId, errorCode(error), errorMessage(error));
        } catch {
          // Continue with the remaining recipients even if delivery auditing is temporarily unavailable.
        }
      }
    }

    return report;
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string')
    return error.code;
  return 'PUSH_DELIVERY_FAILED';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown push delivery failure';
}
