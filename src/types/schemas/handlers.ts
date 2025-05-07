import { z } from 'zod';

// Common schemas
export const apiKeySchema = z.string({
  required_error: 'API key is required',
  invalid_type_error: 'API key must be a string',
});

// List Stocks Handler schemas
export const listStocksQuerySchema = z.object({
  nextToken: z.string().optional(),
  search: z.string().optional(),
});

// Buy Stock Handler schemas
export const buyStockParamsSchema = z.object({
  symbol: z
    .string({
      required_error: 'Stock symbol is required',
      invalid_type_error: 'Stock symbol must be a string',
    })
    .min(1, 'Stock symbol is required'),
});

export const buyStockBodySchema = z.object({
  price: z
    .number({
      required_error: 'Price is required',
      invalid_type_error: 'Price must be a number',
    })
    .positive('Price must be positive'),
  quantity: z
    .number({
      required_error: 'Quantity is required',
      invalid_type_error: 'Quantity must be a number',
    })
    .int('Quantity must be an integer')
    .positive('Quantity must be positive'),
});

// List Portfolios Handler schemas
export const listPortfoliosParamsSchema = z.object({
  userId: z
    .string({
      required_error: 'User ID is required',
      invalid_type_error: 'User ID must be a string',
    })
    .min(1, 'User ID is required'),
});

// Update Stock Tokens Handler schemas
export const updateStockTokensEventSchema = z
  .object({
    // Add any specific event validation if needed
  })
  .passthrough(); // Allow additional properties since it's a CloudWatch event

export const dailyReportQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
