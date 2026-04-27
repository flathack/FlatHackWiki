import { z } from 'zod';

export const amazonDashboardQuerySchema = z.object({
  query: z.object({
    personId: z.string().uuid().optional(),
    assignment: z.enum(['all', 'assigned', 'unassigned']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    paid: z.enum(['all', 'paid', 'unpaid']).optional(),
  }),
});

export const importAmazonCsvSchema = z.object({
  body: z.object({
    files: z
      .array(
        z.object({
          fileName: z.string().trim().min(1).max(255),
          content: z.string().min(1).max(5_000_000),
        })
      )
      .min(1)
      .max(10),
  }),
});

export const createAmazonPersonSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1).max(255),
    notes: z.string().trim().max(4000).nullable().optional(),
  }),
});

export const createAmazonOrderSchema = z.object({
  body: z.object({
    orderDate: z.string().trim().min(1).max(40),
    itemTitle: z.string().trim().min(1).max(2000),
    totalAmount: z.coerce.number().finite(),
    quantity: z.coerce.number().int().min(1).max(999).optional(),
    personId: z.string().uuid().nullable().optional(),
    orderId: z.string().trim().max(120).nullable().optional(),
    currency: z.string().trim().min(3).max(10).optional(),
    paymentInstrument: z.string().trim().max(255).nullable().optional(),
    refundAmount: z.coerce.number().finite().min(0).optional(),
    itemAmount: z.coerce.number().finite().optional(),
    invoiceUrl: z.string().trim().url().max(2048).nullable().optional(),
    orderUrl: z.string().trim().url().max(2048).nullable().optional(),
  }),
});

export const updateAmazonPersonSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1).max(255).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    personId: z.string().uuid(),
  }),
});

export const amazonPersonParamsSchema = z.object({
  params: z.object({
    personId: z.string().uuid(),
  }),
});

export const assignAmazonOrderSchema = z.object({
  body: z.object({
    personId: z.string().uuid().nullable(),
  }),
  params: z.object({
    orderId: z.string().uuid(),
  }),
});

export const updateAmazonSettingsSchema = z.object({
  body: z.object({
    billingDay: z.number().int().min(1).max(28),
  }),
});

export const markAmazonSettlementPaidSchema = z.object({
  body: z.object({
    personId: z.string().uuid(),
    periodKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paidNote: z.string().trim().max(4000).nullable().optional(),
  }),
});
