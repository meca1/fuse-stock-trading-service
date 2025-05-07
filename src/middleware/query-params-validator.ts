import { MiddlewareObj, Request } from '@middy/core';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ZodSchema } from 'zod';
import { handleZodError } from './zod-error-handler';

/**
 * Middleware to validate query parameters
 * @param schema Zod schema to validate against
 */
export const queryParamsValidator = (schema: ZodSchema): MiddlewareObj => {
  return {
    before: (async (request: Request) => {
      const event = request.event as APIGatewayProxyEvent;
      const queryParams = event.queryStringParameters || {};
      const result = schema.safeParse(queryParams);
      
      if (!result.success) {
        throw handleZodError(result.error);
      }

      // Attach validated params to the request for use in the handler
      request.event.queryStringParameters = result.data;
    })
  };
}; 