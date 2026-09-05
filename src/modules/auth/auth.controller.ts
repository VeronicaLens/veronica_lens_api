import type { Request, Response } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../../shared/errors/app-error.js';
import type { AuthService } from './auth.service.js';
import {
  passwordRecoverySchema,
  passwordUpdateSchema,
  refreshSessionSchema,
  signInSchema,
  signUpSchema,
} from './auth.schemas.js';

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body is invalid', {
      fields: result.error.issues.map((issue) => issue.path.join('.')),
    });
  }
  return result.data;
}

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  signUp = async (request: Request, response: Response): Promise<void> => {
    const result = await this.authService.signUp(parseBody(signUpSchema, request.body));
    response.status(result.confirmationRequired ? 202 : 201).json({ data: result });
  };

  signIn = async (request: Request, response: Response): Promise<void> => {
    const session = await this.authService.signIn(parseBody(signInSchema, request.body));
    response.status(200).json({ data: session });
  };

  refresh = async (request: Request, response: Response): Promise<void> => {
    const input = parseBody(refreshSessionSchema, request.body);
    response.status(200).json({ data: await this.authService.refresh(input.refreshToken) });
  };

  requestPasswordRecovery = async (request: Request, response: Response): Promise<void> => {
    const input = parseBody(passwordRecoverySchema, request.body);
    await this.authService.requestPasswordRecovery(input.email);
    response.status(202).json({
      data: { message: 'If the account exists, password recovery instructions were sent.' },
    });
  };

  signOut = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    await this.authService.signOut(request.auth.accessToken);
    response.status(204).send();
  };

  updatePassword = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    const input = parseBody(passwordUpdateSchema, request.body);
    await this.authService.updatePassword(request.auth.userId, input.password);
    response.status(204).send();
  };
}
