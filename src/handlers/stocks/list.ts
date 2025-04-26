import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';

/**
 * Handler to list all available stocks
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Received request to list stocks');
    
    // Extract nextToken from query parameters if present
    const nextToken = event.queryStringParameters?.nextToken;
    console.log(`Request includes nextToken: ${nextToken || 'none'}`);
    
    const stockService = new StockService();
    const { stocks, nextToken: newNextToken } = await stockService.listAllStocks(nextToken);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'success',
        data: stocks,
        count: stocks.length,
        nextToken: newNextToken,
      }),
    };
  } catch (error: any) {
    console.error('Error listing stocks:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Error getting stock list',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};
