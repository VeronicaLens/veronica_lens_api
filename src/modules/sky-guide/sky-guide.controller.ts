import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { skyGuidePositionsSchema } from './sky-guide.schemas.js';
import type { SkyGuideService } from './sky-guide.service.js';

export class SkyGuideController {
  constructor(private readonly service: SkyGuideService) {}

  positions = async (request: Request, response: Response): Promise<void> => {
    const parsed = skyGuidePositionsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Sky guide position request is invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const result = await this.service.getPositions({
      objectIds: [...new Set(parsed.data.objectIds)],
      observedAt: new Date(parsed.data.observedAt),
      observer: parsed.data.observer,
    });
    response.status(200).json({
      data: result.positions,
      meta: {
        count: result.positions.length,
        unavailableObjectIds: result.unavailableObjectIds,
      },
    });
  };
}
