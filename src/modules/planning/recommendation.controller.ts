import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { observationRecommendationSchema } from './recommendation.schemas.js';
import type { ObservationRecommendationPort } from './recommendation.service.js';

export class ObservationRecommendationController {
  constructor(private readonly service: ObservationRecommendationPort) {}

  recommend = async (request: Request, response: Response): Promise<void> => {
    const parsed = observationRecommendationSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Observation recommendation request is invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const result = await this.service.recommend({
      ...parsed.data,
      windowFrom: new Date(parsed.data.windowFrom),
      windowTo: new Date(parsed.data.windowTo),
    });
    response.status(200).json({ data: result });
  };
}
