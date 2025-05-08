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
import { errorHandler } from '../../middleware/error-handler';

// Schemas
import { buyStockParamsSchema } from '../../types/schemas/handlers';
import { buyStockResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

// Errors
import { ValidationError, VendorApiError } from '../../utils/errors/app-error';

interface VendorApiErrorResponse {
  status: number;
  message?: string;
}

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

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
    throw new ValidationError('Missing required parameters: symbol, price, quantity, or userId');
  }

  // Validate numeric values
  if (price <= 0 || quantity <= 0) {
    throw new ValidationError('Price and quantity must be greater than 0');
  }

  try {
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
    // Si es un error del API del vendedor, lo convertimos a VendorApiError
    const vendorError = error as VendorApiErrorResponse;
    if (vendorError.status) {
      throw new VendorApiError(
        vendorError.message || 'Error from vendor API',
        vendorError.status,
        { symbol, price, quantity, userId }
      );
    }
    throw error;
  }
};

// Export the handler wrapped with Middy middleware
export const handler = middy(buyStockHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(buyStockParamsSchema))
  .use(errorHandler())
  .use(httpErrorHandler())
  .use(createResponseValidator(buyStockResponseSchema))
  .use(securityHeaders());
