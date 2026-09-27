import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { currentConditionsSchema } from './current-conditions.schemas.js';
import type { CurrentConditionsPort } from './current-conditions.service.js';

export class CurrentConditionsController {
  constructor(private readonly service: CurrentConditionsPort) {}

  current = async (request: Request, response: Response): Promise<void> => {
    const parsed = currentConditionsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Current conditions request is invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const result = await this.service.getCurrent({
      observer: {
        latitudeDegrees: parsed.data.latitudeDegrees,
        longitudeDegrees: parsed.data.longitudeDegrees,
        elevationMeters: parsed.data.elevationMeters,
      },
    });
    response.status(200).json({ data: result });
  };
}
