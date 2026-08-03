import { z } from 'zod';

/**
 * Parse req.body with a Zod schema. Returns { success, data } or { success: false, error }.
 */
export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues?.[0]?.message || 'Invalid request body';
    return { success: false, error: message, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}

const attachmentSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(512),
  url: z.string().min(1).max(2048),
  type: z.string().min(1).max(256),
  size: z.number().int().nonnegative().max(500 * 1024 * 1024)
});

/** Comment create — authorId from client is ignored (bound server-side). */
export const createCommentBodySchema = z.object({
  id: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
  text: z.string().min(1, 'Comment cannot be empty').max(10000, 'Comment must be less than 10000 characters'),
  createdAt: z.union([z.string().min(1), z.number()]).optional(),
  attachments: z.array(attachmentSchema).max(50).optional()
}).passthrough();

export const updateCommentBodySchema = z.object({
  text: z.string().min(1, 'Comment cannot be empty').max(10000, 'Comment must be less than 10000 characters')
});

export const loginBodySchema = z.object({
  email: z.string().trim().email('Valid email is required').max(320),
  password: z.string().min(1, 'Password is required').max(1024)
});

export const passwordResetRequestBodySchema = z.object({
  email: z.string().trim().email('Valid email is required').max(320)
});

export const passwordResetCompleteBodySchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(6, 'Password must be at least 6 characters long').max(1024)
});
