import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// Services
import { PortfolioService } from '../../services/portfolio-service';

// Middleware
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';
import { createResponseValidator } from '../../middleware/response-validator';

// Schemas
import { listPortfoliosParamsSchema } from '../../types/schemas/handlers';
import { portfolioResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

/**
 * Handler to get the portfolio summary for a user
 */
const getPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { userId } = event.pathParameters as { userId: string };
  
  const portfolioService = await PortfolioService.initialize();
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: HTTP_STATUS.OK,
    headers: HTTP_HEADERS,
    body: JSON.stringify({
      status: 'success',
      data: summary.data,
      metadata: {
        cached: summary.fromCache,
        timestamp: summary.timestamp
      }
    })
  };
};

// Export the handler wrapped with Middy middleware
export const handler = middy(getPortfoliosHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(listPortfoliosParamsSchema))
  .use(httpErrorHandler())
  .use(createResponseValidator(portfolioResponseSchema));
