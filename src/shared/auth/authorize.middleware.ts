import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import type { AppRole } from './auth.types.js';

export function authorize(...allowedRoles: AppRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }

    if (!allowedRoles.includes(request.auth.role)) {
      next(new AppError(403, 'INSUFFICIENT_PERMISSION', 'Insufficient permission'));
      return;
    }

    next();
  };
}
