import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { AppError } from '../../utils/errors/app-error';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { listPortfoliosParamsSchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';

/**
 * Handler to get the portfolio summary for a user
 */
const listPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Validate path parameters
  const paramsResult = listPortfoliosParamsSchema.safeParse(event.pathParameters || {});
  
  if (!paramsResult.success) {
    throw handleZodError(paramsResult.error);
  }

  const { userId } = paramsResult.data;

  console.log('Getting portfolio summary for user', {
    level: 'info',
    userId,
    timestamp: new Date().toISOString()
  });
  
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
