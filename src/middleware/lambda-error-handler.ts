import { APIGatewayProxyResult } from 'aws-lambda';
import { AppError } from '../utils/errors/app-error';

interface ErrorResponse {
  status: string;
  code: string;
  message: string;
  details?: unknown;
}

export const handleLambdaError = (error: Error | AppError): APIGatewayProxyResult => {
  let response: ErrorResponse;
  let statusCode: number;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    response = {
      status: 'error',
      code: error.code,
      message: error.message
    };

    // Log operational errors
    console.warn(JSON.stringify({
      level: 'warn',
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString()
    }));
  } else {
    // Handle unknown errors
    statusCode = 500;
    response = {
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    };

    // Log unknown errors
    console.error(JSON.stringify({
      level: 'error',
      message: 'Unexpected error occurred',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    }));

    // Include error details in development
    if (process.env.NODE_ENV === 'development') {
      response.details = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(response)
  };
};

export const wrapHandler = (handler: Function) => {
  return async (...args: any[]): Promise<APIGatewayProxyResult> => {
    try {
      const response = await handler(...args);
      return response;
    } catch (error) {
      return handleLambdaError(error as Error);
    }
  };
}; 