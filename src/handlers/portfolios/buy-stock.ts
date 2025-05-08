import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// Services
import { PortfolioService } from '../../services/portfolio-service';

// Middleware
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';
import { createResponseValidator } from '../../middleware/response-validator';
import { securityHeaders } from '../../middleware/security-headers';

// Schemas
import { buyStockParamsSchema } from '../../types/schemas/handlers';
import { buyStockResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

interface VendorApiError extends Error {
  status?: number;
  code?: string;
  retryable?: boolean;
}

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  try {
    // Initialize service
    const portfolioService = await PortfolioService.initialize();

    // Get parameters from validated event
    const { symbol } = event.pathParameters as { symbol: string };
    const { price, quantity, userId } = JSON.parse(event.body!) as {
      price: number;
      quantity: number;
      userId: string;
    };

    // Validate input parameters
    if (!symbol || !price || !quantity || !userId) {
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          message: 'Missing required parameters: symbol, price, quantity, or userId',
        }),
      };
    }

    // Validate numeric values
    if (price <= 0 || quantity <= 0) {
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          message: 'Price and quantity must be greater than 0',
        }),
      };
    }

    // Execute purchase
    const transaction = await portfolioService.buyStock(userId, symbol, quantity, price);

    const executionTime = Date.now() - startTime;

    return {
      statusCode: HTTP_STATUS.OK,
      headers: HTTP_HEADERS,
      body: JSON.stringify({
        status: 'success',
        data: {
          ...transaction,
          executionTime: `${executionTime}ms`,
        },
      }),
    };
  } catch (error) {
    console.error('Error buying stock:', error);

    const vendorError = error as VendorApiError;

    // Handle specific error types
    if (vendorError.status === 500) {
      return {
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          message: 'The stock trading service is currently unavailable. Please try again later.',
          error: vendorError.message,
        }),
      };
    }

    if (vendorError.status === 404) {
      return {
        statusCode: HTTP_STATUS.NOT_FOUND,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          message: 'Stock not found or not available for trading',
          error: vendorError.message,
        }),
      };
    }

    if (vendorError.status === 400) {
      return {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        headers: HTTP_HEADERS,
        body: JSON.stringify({
          status: 'error',
          message: 'Invalid request parameters',
          error: vendorError.message,
        }),
      };
    }

    // Default error response
    return {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: HTTP_HEADERS,
      body: JSON.stringify({
        status: 'error',
        message: 'An unexpected error occurred while processing your request',
        error: vendorError.message || 'Unknown error',
      }),
    };
  }
};

// Export the handler wrapped with Middy middleware
export const handler = middy(buyStockHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(buyStockParamsSchema))
  .use(httpErrorHandler())
  .use(createResponseValidator(buyStockResponseSchema))
  .use(securityHeaders());
