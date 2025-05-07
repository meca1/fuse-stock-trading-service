import { z } from 'zod';

export const portfolioResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    userId: z.string(),
    totalValue: z.number(),
    currency: z.string(),
    lastUpdated: z.string(),
    stocks: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        quantity: z.number(),
        currentPrice: z.number(),
        profitLoss: z.object({
          absolute: z.number(),
          percentage: z.number(),
        }),
      }),
    ),
  }),
  metadata: z.object({
    cached: z.boolean(),
    timestamp: z.string(),
  }),
});

export const stocksResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    stocks: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        price: z.number(),
        currency: z.string(),
        market: z.string(),
        lastUpdated: z.string().optional(),
        percentageChange: z.number().optional(),
        volume: z.number().optional(),
      }),
    ),
    nextToken: z.string().optional(),
    totalItems: z.number(),
    lastUpdated: z.string().optional(),
  }),
  metadata: z.object({
    cached: z.boolean(),
  }),
});

export const dailyReportResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    message: z.string(),
    date: z.string(),
    recipients: z.array(z.string()),
    executionTime: z.number(),
    reportSummary: z.object({
      totalTransactions: z.number(),
      successfulTransactions: z.number(),
      failedTransactions: z.number(),
      totalAmount: z.number(),
    }),
  }),
});

export const updateStockTokensResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    message: z.string(),
  }),
});

export const errorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
});

export const buyStockResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.object({
      id: z.string(),
      portfolio_id: z.string(),
      stock_symbol: z.string(),
      type: z.string(),
      quantity: z.number(),
      price: z.string(),
      status: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      executionTime: z.string(),
    }),
  }),
  errorResponseSchema,
]);
