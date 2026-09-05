import { z } from 'zod';

const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(72);

export const signUpSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(100).optional(),
});

export const signInSchema = z.object({ email, password: z.string().min(1).max(72) });
export const refreshSessionSchema = z.object({ refreshToken: z.string().min(1) });
export const passwordRecoverySchema = z.object({ email });
export const passwordUpdateSchema = z.object({ password });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
