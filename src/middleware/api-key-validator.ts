import { MiddlewareObj, Request } from '@middy/core';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { apiKeySchema } from '../types/schemas/handlers';
import { AuthenticationError } from '../utils/errors/app-error';

/**
 * Middleware to validate API key in request headers
 */
export const apiKeyValidator = (): MiddlewareObj => {
  return {
    before: async (request: Request) => {
      const event = request.event as APIGatewayProxyEvent;
      const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
      const apiKeyResult = apiKeySchema.safeParse(apiKey);

      if (!apiKeyResult.success) {
        throw new AuthenticationError('Invalid API key format');
      }

      if (apiKey !== process.env.VENDOR_API_KEY) {
        throw new AuthenticationError('Invalid API key');
      }
    },
  };
};
