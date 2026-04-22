import { z } from 'zod';
import { DashboardWidgetType } from '@prisma/client';

const widgetTypeValues = Object.values(DashboardWidgetType) as [DashboardWidgetType, ...DashboardWidgetType[]];
const weekdayValues = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

const jsonRecordSchema = z.record(z.string(), z.any());
const bookmarkUrlSchema = z.string().trim().min(1).max(2048);
const faviconValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(500_000)
  .refine((value) => {
    if (value.startsWith('data:image/')) return true;
    return z.string().url().safeParse(value).success;
  }, 'Ungültige Favicon-URL');

export const createWidgetSchema = z.object({
  body: z.object({
    type: z.enum(widgetTypeValues),
    title: z.string().trim().min(1).max(255).optional(),
  }),
});

export const updateWidgetSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(255).nullable().optional(),
    isVisible: z.boolean().optional(),
    isCollapsed: z.boolean().optional(),
    settings: jsonRecordSchema.optional(),
  }),
  params: z.object({
    widgetId: z.string().uuid(),
  }),
});

export const updateWidgetLayoutSchema = z.object({
  body: z.object({
    widgets: z
      .array(
        z.object({
          id: z.string().uuid(),
          x: z.number().int().min(0),
          y: z.number().int().min(0),
          width: z.number().int().min(1).max(12),
          height: z.number().int().min(1).max(20),
          mobileOrder: z.number().int().min(0).max(200),
        })
      )
      .min(1),
  }),
});

export const widgetIdParamsSchema = z.object({
  params: z.object({
    widgetId: z.string().uuid(),
  }),
});

export const createBookmarkSchema = z.object({
  body: z.object({
    itemType: z.enum(['BOOKMARK', 'FOLDER']).default('BOOKMARK'),
    parentId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(255),
    url: bookmarkUrlSchema.nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    faviconUrl: faviconValueSchema.nullable().optional(),
    isFavorite: z.boolean().optional(),
    showInToolbar: z.boolean().optional(),
  }),
});

export const updateBookmarkSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(255).optional(),
    parentId: z.string().uuid().nullable().optional(),
    itemType: z.enum(['BOOKMARK', 'FOLDER']).optional(),
    url: bookmarkUrlSchema.nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    faviconUrl: faviconValueSchema.nullable().optional(),
    isFavorite: z.boolean().optional(),
    showInToolbar: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  }),
  params: z.object({
    bookmarkId: z.string().uuid(),
  }),
});

export const reorderBookmarksSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          id: z.string().uuid(),
          parentId: z.string().uuid().nullable(),
          sortOrder: z.number().int().min(0).max(9999),
          showInToolbar: z.boolean().optional(),
        })
      )
      .min(1),
  }),
});

export const importBookmarksSchema = z.object({
  body: z.object({
    html: z.string().trim().min(1).max(2_000_000),
    mode: z.enum(['append', 'replace']).default('append').optional(),
  }),
});

export const bookmarkIdParamsSchema = z.object({
  params: z.object({
    bookmarkId: z.string().uuid(),
  }),
});

export const updateCommuteSchema = z.object({
  body: z.object({
    sourceAddress: z.string().trim().min(2).max(500),
    destinationAddress: z.string().trim().min(2).max(500),
    officeDays: z.array(z.enum(weekdayValues)).max(7),
    homeOfficeDays: z.array(z.enum(weekdayValues)).max(7),
    outboundLabel: z.string().trim().max(100).nullable().optional(),
    returnLabel: z.string().trim().max(100).nullable().optional(),
    departureTime: z.string().trim().max(10).nullable().optional(),
    returnDepartureTime: z.string().trim().max(10).nullable().optional(),
  }),
});

export const createTimeProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).nullable().optional(),
    color: z.string().trim().max(20).nullable().optional(),
    client: z.string().trim().max(255).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
  }),
});

export const updateTimeProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    color: z.string().trim().max(20).nullable().optional(),
    client: z.string().trim().max(255).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    isArchived: z.boolean().optional(),
  }),
  params: z.object({
    projectId: z.string().uuid(),
  }),
});

export const projectIdParamsSchema = z.object({
  params: z.object({
    projectId: z.string().uuid(),
  }),
});

export const startTimerSchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    note: z.string().trim().max(4000).nullable().optional(),
  }),
});

export const createTimeEntrySchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    note: z.string().trim().max(4000).nullable().optional(),
  }),
});

export const updateTimeEntrySchema = z.object({
  body: z.object({
    projectId: z.string().uuid().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().nullable().optional(),
    note: z.string().trim().max(4000).nullable().optional(),
  }),
  params: z.object({
    entryId: z.string().uuid(),
  }),
});

export const stopTimerSchema = z.object({
  body: z.object({
    endTime: z.string().datetime().optional(),
  }),
  params: z.object({
    entryId: z.string().uuid(),
  }),
});

export const entryIdParamsSchema = z.object({
  params: z.object({
    entryId: z.string().uuid(),
  }),
});

export const sendTelegramMessageSchema = z.object({
  body: z.object({
    content: z.string().trim().min(1).max(4000),
  }),
});
