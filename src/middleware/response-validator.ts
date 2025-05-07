import { z } from 'zod';
import { AppError } from '../utils/errors/app-error';

export const createResponseValidator = (schema: z.ZodType) => ({
  after: async (request: any) => {
    try {
      const response = JSON.parse(request.response.body);
      schema.parse(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError('Invalid response format', 500, 'RESPONSE_VALIDATION_ERROR', {
          details: error.errors,
        });
      }
      throw error;
    }
  },
});
