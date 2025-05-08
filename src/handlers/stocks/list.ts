import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// Services
import { StockService } from '../../services/stock-service';

// Middleware
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';
import { createResponseValidator } from '../../middleware/response-validator';
import { securityHeaders } from '../../middleware/security-headers';

// Schemas
import { listStocksQuerySchema } from '../../types/schemas/handlers';
import { stocksResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

/**
 * Handler to list all available stocks
 */
const listStocksHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { nextToken, search } = event.queryStringParameters || {};

  const stockService = await StockService.initialize();
  const { data: responseData, cached } = await stockService.getStocksWithCache(nextToken, search);

  return {
    statusCode: HTTP_STATUS.OK,
    headers: HTTP_HEADERS,
    body: JSON.stringify({
      status: 'success',
      data: responseData,
      metadata: {
        cached,
      },
    }),
  };
};

// Export the handler wrapped with Middy middleware
export const handler = middy(listStocksHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(listStocksQuerySchema))
  .use(httpErrorHandler())
  .use(createResponseValidator(stocksResponseSchema))
  .use(securityHeaders());
