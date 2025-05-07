import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { listPortfoliosParamsSchema } from '../../types/schemas/handlers';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';


/**
 * Handler to get the portfolio summary for a user
 */
const getPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Extract userId from path: /users/{userId}/portfolios
  const userId = event.pathParameters?.userId;
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  // Initialize portfolio service with all dependencies
  const portfolioService = await PortfolioService.initialize();
  
  // Get portfolio summary
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
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
  .use(httpErrorHandler());
