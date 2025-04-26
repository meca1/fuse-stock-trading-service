import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';

/**
 * Handler to list portfolios for a user
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
    
    console.log(`Received request to list portfolios for user: ${userId}`);
    
    const portfolioService = new PortfolioService();
    const portfolios = await portfolioService.getUserPortfolios(userId);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'success',
        data: portfolios,
        count: portfolios.length,
      }),
    };
  } catch (error: any) {
    console.error('Error listing portfolios:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Error getting portfolio list',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};
