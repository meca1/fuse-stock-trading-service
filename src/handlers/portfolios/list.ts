import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';

/**
 * Handler to get the portfolio summary for a user
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'User ID is required',
        }),
      };
    }
    
    console.log(`Received request to get portfolio summary for user: ${userId}`);
    const portfolioService = new PortfolioService();
    const summary = await portfolioService.getUserPortfolioSummary(Number(userId));
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'success',
        data: summary
      }),
    };
  } catch (error: any) {
    console.error('Error getting portfolio summary:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Error getting portfolio summary',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};
