import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { upcomingEventsSchema } from './events.schemas.js';
import type { EventsService } from './events.service.js';

export class EventsController {
  constructor(private readonly service: EventsService) {}

  upcoming = async (request: Request, response: Response): Promise<void> => {
    const parsed = upcomingEventsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Astronomical event filters are invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }
    const result = await this.service.getUpcoming({
      from: new Date(parsed.data.from),
      to: new Date(parsed.data.to),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      observer: {
        latitudeDegrees: parsed.data.latitudeDegrees,
        longitudeDegrees: parsed.data.longitudeDegrees,
        elevationMeters: parsed.data.elevationMeters,
      },
    });
    response.status(200).json({
      data: result.events,
      meta: {
        count: result.events.length,
        source: result.source,
        stale: result.stale,
        updatedAt: result.updatedAt,
      },
    });
  };
}
