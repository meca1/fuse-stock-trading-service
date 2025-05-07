import { z } from 'zod';

export const createResponseValidator = (schema: z.ZodType) => ({
  after: async (request: any) => {
    const response = JSON.parse(request.response.body);
    schema.parse(response);
  }
}); 