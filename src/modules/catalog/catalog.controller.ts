import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { catalogQuerySchema } from './catalog.schemas.js';
import type { CatalogService } from './catalog.service.js';

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  search = async (request: Request, response: Response): Promise<void> => {
    const parsed = catalogQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Catalog query is invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }

    const objects = await this.service.search(parsed.data);
    response.status(200).json({ data: objects, meta: { count: objects.length } });
  };
}
