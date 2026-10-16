import { AppError } from '../../shared/errors/app-error.js';
import type { EventsModelPort, UpcomingEventsQuery, UpcomingEventsResult } from './events.model.js';

export class EventsService {
  constructor(private readonly model: EventsModelPort) {}

  async getUpcoming(query: UpcomingEventsQuery): Promise<UpcomingEventsResult> {
    try {
      return await this.model.findUpcoming(query);
    } catch {
      throw new AppError(
        503,
        'ASTRONOMY_EVENTS_UNAVAILABLE',
        'Astronomical events are temporarily unavailable',
      );
    }
  }
}
