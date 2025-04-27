import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { ValidationError } from '../../utils/errors/app-error';
import { wrapHandler } from '../../middleware/lambda-error-handler';

/**
 * Handler to get the portfolio summary for a user
 */
const listPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.pathParameters?.userId;
  
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  console.log(JSON.stringify({
    level: 'info',
    message: 'Getting portfolio summary for user',
    userId,
    timestamp: new Date().toISOString()
  }));
  
  const portfolioService = await PortfolioService.getInstance();
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'success',
      data: summary
    })
  };
};

export const handler = wrapHandler(listPortfoliosHandler);
