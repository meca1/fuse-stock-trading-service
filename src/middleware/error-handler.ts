import { MiddlewareObj, Request } from '@middy/core';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, ServiceUnavailableError, VendorApiError } from '../utils/errors/app-error';
import { HTTP_HEADERS, HTTP_STATUS } from '../constants/http';
import { ZodError } from 'zod';

interface AWSError extends Error {
  service?: string;
  code?: string;
}

/**
 * Middleware to handle errors in a centralized way
 */
export const errorHandler = (): MiddlewareObj => {
  return {
    onError: async (request: Request): Promise<APIGatewayProxyResult> => {
      const error = request.error;
      console.error('Error caught by error handler:', error);

      if (!error) {
        return {
          statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          headers: HTTP_HEADERS,
          body: JSON.stringify({
            status: 'error',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
          }),
        };
      }

      // Si el error ya es un AppError, lo usamos directamente
      if (error instanceof AppError) {
        return {
          statusCode: error.statusCode,
          headers: HTTP_HEADERS,
          body: JSON.stringify({
            status: 'error',
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details }),
          }),
        };
      }

      // Si es un error de validación de Zod
      if (error instanceof ZodError) {
        const validationError = new ValidationError('Validation failed', {
          errors: error.errors,
        });
        return {
          statusCode: validationError.statusCode,
          headers: HTTP_HEADERS,
          body: JSON.stringify({
            status: 'error',
            code: validationError.code,
            message: validationError.message,
            details: validationError.details,
          }),
        };
      }

      // Si es un error de AWS
      if (error.name?.includes('AWS')) {
        const awsError = error as AWSError;
        const serviceError = new ServiceUnavailableError('AWS service error', {
          service: awsError.service,
          code: awsError.code,
        });
        return {
          statusCode: serviceError.statusCode,
          headers: HTTP_HEADERS,
          body: JSON.stringify({
            status: 'error',
            code: serviceError.code,
            message: serviceError.message,
            details: serviceError.details,
          }),
        };
      }

      // Error por defecto
      return {
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        }),
      };
    },
  };
}; 