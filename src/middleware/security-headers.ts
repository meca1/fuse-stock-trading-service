import { MiddlewareObj, Request } from '@middy/core';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import helmet from 'helmet';

/**
 * Middleware to add security headers using Helmet
 */
export const securityHeaders = (): MiddlewareObj => {
  return {
    after: async (request: Request) => {
      if (!request.response) {
        return request.response;
      }

      const helmetMiddleware = helmet();
      
      // Convert Lambda response to Express-like request/response
      const req = {
        headers: request.event.headers || {},
      };
      
      const res = {
        getHeader: () => {},
        setHeader: (name: string, value: string) => {
          if (request.response) {
            request.response.headers = {
              ...request.response.headers,
              [name]: value,
            };
          }
        },
        removeHeader: (name: string) => {
          if (request.response && request.response.headers) {
            const { [name]: _, ...rest } = request.response.headers;
            request.response.headers = rest;
          }
        },
        headers: {},
      };

      // Apply Helmet middleware
      await new Promise((resolve) => {
        helmetMiddleware(req as any, res as any, resolve);
      });

      return request.response;
    },
  };
}; 