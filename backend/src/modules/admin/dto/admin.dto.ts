import { Role, UserStatus } from '@prisma/client';
import { z } from 'zod';

export const updateUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    globalRole: z.nativeEnum(Role).nullable().optional(),
  }),
});

export const userIdParamsSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
