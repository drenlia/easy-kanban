import { z } from 'zod';

/**
 * Parse req.body with a Zod schema. Returns { success, data } or { success: false, error }.
 */
export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues?.[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    const message = `${path}${issue?.message || 'Invalid request body'}`;
    return { success: false, error: message, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}

const idSchema = z.string().min(1).max(128);

/** FE often sends "" for cleared fields; priorityId may be a number from the DB/API. */
const optionalNullableId = z.preprocess((v) => {
  if (v === '' || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return v;
}, z.union([idSchema, z.null()]).optional());

const optionalDate = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.string().max(64), z.null()]).optional()
);

const effortSchema = z.union([z.number(), z.string().max(32), z.null()]).optional();

/** DB / FE may send 0/1 or "true"/"false" for blocked flags. */
const booleanish = z.preprocess((v) => {
  if (v === 0 || v === '0' || v === 'false' || v === false) return false;
  if (v === 1 || v === '1' || v === 'true' || v === true) return true;
  return v;
}, z.boolean().optional());

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

/** Task create / add-at-top — core fields required; extras passthrough for FE compatibility. */
export const createTaskBodySchema = z.object({
  id: idSchema,
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(500_000).optional(),
  memberId: optionalNullableId,
  requesterId: optionalNullableId,
  startDate: optionalDate,
  dueDate: optionalDate,
  effort: effortSchema,
  priority: z.union([z.string().max(100), z.null()]).optional(),
  priorityId: optionalNullableId,
  columnId: idSchema,
  boardId: idSchema,
  position: z.union([z.number(), z.string().max(32)]).optional(),
  sprintId: optionalNullableId
}).passthrough();

/** Task update — partial; known fields constrained; unknown keys allowed. */
export const updateTaskBodySchema = z.object({
  id: idSchema.optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.union([z.string().max(500_000), z.null()]).optional(),
  memberId: optionalNullableId,
  requesterId: optionalNullableId,
  startDate: optionalDate,
  dueDate: optionalDate,
  effort: effortSchema,
  priority: z.union([z.string().max(100), z.null()]).optional(),
  priorityId: optionalNullableId,
  columnId: z.preprocess((v) => (v === '' ? undefined : v), idSchema.optional()),
  boardId: z.preprocess((v) => (v === '' ? undefined : v), idSchema.optional()),
  position: z.union([z.number(), z.string().max(32), z.null()]).optional(),
  sprintId: optionalNullableId,
  isBlocked: booleanish,
  blockedReason: z.union([z.string().max(2000), z.null()]).optional(),
  skipActivity: z.boolean().optional()
}).passthrough();

export const copyTaskBodySchema = z.object({
  taskId: idSchema,
  boardId: idSchema.optional()
}).passthrough();

export const bulkFieldActivityBodySchema = z.object({
  field: z.enum(['memberId', 'requesterId', 'priorityId', 'sprintId']),
  taskIds: z.array(idSchema).min(1).max(500),
  newValue: z.preprocess(
    (v) => (v === '' ? null : v),
    z.union([z.string().max(128), z.null()]).optional()
  ),
  oldValue: z.preprocess(
    (v) => (v === '' ? null : v),
    z.union([z.string().max(128), z.null()]).optional()
  ),
  newLabel: z.union([z.string().max(500), z.null()]).optional(),
  boardId: optionalNullableId
});

export const batchUpdateTasksBodySchema = z.object({
  tasks: z.array(
    z.object({
      id: idSchema
    }).passthrough()
  ).min(1).max(500)
});

export const batchUpdatePositionsBodySchema = z.object({
  updates: z.array(
    z.object({
      taskId: idSchema,
      position: z.union([z.number(), z.string().max(32)]),
      columnId: idSchema.optional()
    }).passthrough()
  ).min(1).max(2000)
});

export const reorderTaskBodySchema = z.object({
  taskId: idSchema,
  newPosition: z.union([z.number(), z.string().max(32)]),
  columnId: idSchema
}).passthrough();

export const moveTaskToBoardBodySchema = z.object({
  taskId: idSchema,
  targetBoardId: idSchema
});

export const permanentBatchBodySchema = z.object({
  taskIds: z.array(idSchema).min(1).max(500)
});

export const adminCreateUserBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required').max(320),
  // Invite (inactive) may omit password; active local create still needs one (enforced in route).
  password: z.string().max(1024).optional().default(''),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['admin', 'user'], { message: 'User role is required' }),
  displayName: z.string().max(100).optional(),
  isActive: booleanish,
  baseUrl: z.string().max(2048).optional()
}).passthrough();

export const adminUpdateUserBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  isActive: booleanish
}).passthrough();

/** Accept either `{ role }` (Admin.tsx) or `{ action: promote|demote }` (api helper). */
export const adminUpdateUserRoleBodySchema = z.union([
  z.object({ role: z.enum(['admin', 'user']) }),
  z.object({ action: z.enum(['promote', 'demote']) }).transform(({ action }) => ({
    role: action === 'promote' ? 'admin' : 'user'
  }))
]);

// —— Boards / columns ——

export const createBoardBodySchema = z.object({
  id: idSchema,
  title: z.string().min(1, 'Board title is required').max(200)
}).passthrough();

export const updateBoardBodySchema = z.object({
  title: z.string().min(1, 'Board title is required').max(200)
}).passthrough();

export const reorderBoardBodySchema = z.object({
  boardId: idSchema,
  newPosition: z.union([z.number(), z.string().max(32)])
}).passthrough();

export const createColumnBodySchema = z.object({
  id: idSchema,
  title: z.string().min(1, 'Column title is required').max(200),
  boardId: idSchema,
  position: z.union([z.number(), z.string().max(32), z.null()]).optional()
}).passthrough();

export const updateColumnBodySchema = z.object({
  title: z.string().min(1, 'Column title is required').max(200),
  is_finished: booleanish,
  is_archived: booleanish,
  wip_limit: z.union([z.number(), z.string().max(32), z.null()]).optional(),
  policy_text: z.union([z.string().max(2000), z.null()]).optional()
}).passthrough();

export const reorderColumnBodySchema = z.object({
  columnId: idSchema,
  newPosition: z.union([z.number(), z.string().max(32)]),
  boardId: idSchema
}).passthrough();

export const renumberColumnsBodySchema = z.object({
  boardId: idSchema
}).passthrough();

// —— Settings ——

const settingValueSchema = z.union([
  z.string().max(100_000),
  z.number(),
  z.boolean(),
  z.null()
]);

export const updateSettingBodySchema = z.object({
  key: z.string().min(1, 'Setting key is required').max(128),
  value: settingValueSchema
}).passthrough();

export const bulkUpdateSettingsBodySchema = z.object({
  settings: z.record(z.string().max(128), settingValueSchema)
});

export const updateAppUrlBodySchema = z.object({
  appUrl: z.string().min(1).max(2048)
}).passthrough();

// —— Tags / priorities / sprints / members ——

export const createTagBodySchema = z.object({
  tag: z.string().min(1, 'Tag name is required').max(100),
  description: z.string().max(2000).optional(),
  color: z.string().max(32).optional()
}).passthrough();

export const updateTagBodySchema = createTagBodySchema;

export const createPriorityBodySchema = z.object({
  priority: z.string().min(1, 'Priority name is required').max(100),
  color: z.string().min(1, 'Color is required').max(32)
}).passthrough();

export const updatePriorityBodySchema = createPriorityBodySchema;

export const reorderPrioritiesBodySchema = z.object({
  priorities: z
    .array(
      z
        .object({
          id: z.union([z.number(), z.string().min(1).max(128)])
        })
        .passthrough()
    )
    .min(1)
    .max(100)
});

export const createSprintBodySchema = z.object({
  name: z.string().min(1, 'Sprint name is required').max(200),
  start_date: z.string().min(1, 'Start date is required').max(64),
  end_date: z.string().min(1, 'End date is required').max(64),
  is_active: booleanish,
  description: z.union([z.string().max(5000), z.null()]).optional()
}).passthrough();

export const updateSprintBodySchema = createSprintBodySchema;

export const createMemberBodySchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Member name is required').max(100),
  color: z.string().min(1, 'Color is required').max(32)
}).passthrough();
