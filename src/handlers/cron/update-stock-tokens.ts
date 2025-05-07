import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// Services
import { StockService } from '../../services/stock-service';

// Middleware
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';
import { createResponseValidator } from '../../middleware/response-validator';

// Schemas
import { updateStockTokensEventSchema } from '../../types/schemas/handlers';
import { updateStockTokensResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

/**
 * Handler to update stock tokens
 */
const updateStockTokensHandler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const stockService = await StockService.initialize();
  await stockService.updateStockTokens();

  return {
    statusCode: HTTP_STATUS.OK,
    headers: HTTP_HEADERS,
    body: JSON.stringify({
      status: 'success',
      data: {
        message: 'Stock tokens updated successfully',
      },
    }),
  };
};

// Export the handler wrapped with Middy middleware
export const handler = middy(updateStockTokensHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(updateStockTokensEventSchema))
  .use(httpErrorHandler())
  .use(createResponseValidator(updateStockTokensResponseSchema));
