import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import type { ProfileService } from './profile.service.js';
import { updateProfileSchema } from './profile.schemas.js';

function auth(request: Request) {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
  return request.auth;
}

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  get = async (request: Request, response: Response): Promise<void> => {
    const context = auth(request);
    response.status(200).json({ data: await this.service.get(context.supabase, context.userId) });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body is invalid', {
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }
    const context = auth(request);
    response
      .status(200)
      .json({ data: await this.service.update(context.supabase, context.userId, parsed.data) });
  };
}
