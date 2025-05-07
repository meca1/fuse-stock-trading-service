import { Request } from '@middy/core';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors/app-error';

/**
 * Middleware to validate path or query parameters using a Zod schema
 */
export const queryParamsValidator = (schema: ZodSchema) => {
  return {
    before: async (request: Request<APIGatewayProxyEvent>) => {
      try {
        // If path parameters exist, validate them
        if (request.event.pathParameters) {
          const validatedParams = schema.parse(request.event.pathParameters);
          request.event.pathParameters = validatedParams;
        } 
        // If query parameters exist, validate them
        else if (request.event.queryStringParameters) {
          const validatedParams = schema.parse(request.event.queryStringParameters);
          request.event.queryStringParameters = validatedParams;
        }
        // If neither exists, validate against empty object
        else {
          const result = schema.safeParse({});
          if (!result.success) {
            throw new ValidationError('Missing required parameters', { error: result.error });
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError('Invalid parameters', { error });
      }
    }
  };
}; 