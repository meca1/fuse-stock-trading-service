import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { TransactionStatus } from '../../models/interfaces';
import { Portfolio } from '../../models/Portfolio';

/**
 * Handler to execute a stock purchase
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const symbol = event.pathParameters?.symbol;
    
    if (!symbol) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'Stock symbol is required',
        }),
      };
    }
    
    // Get or create default portfolio for the transaction
    // In a real application, this would come from authentication or request body
    let portfolioId: string;
    try {
      const defaultPortfolio = await Portfolio.findOne({
        where: { userId: 'default-user' }
      });
      
      if (defaultPortfolio) {
        portfolioId = defaultPortfolio.id;
      } else {
        // Create a default portfolio if none exists
        const newPortfolio = await Portfolio.create({
          userId: 'default-user',
          name: 'Default Portfolio',
          balance: 10000, // Starting with $10,000
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        portfolioId = newPortfolio.id;
      }
    } catch (error) {
      console.error('Error getting or creating default portfolio:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'Error processing portfolio information',
        }),
      };
    }
    
    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'Request body is required',
        }),
      };
    }
    
    const { price, quantity } = JSON.parse(event.body);
    
    if (typeof price !== 'number' || typeof quantity !== 'number') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'Price and quantity are required',
        }),
      };
    }
    
    if (price <= 0 || quantity <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'error',
          message: 'Price and quantity must be greater than zero',
        }),
      };
    }
    
    console.log(`Received request to buy ${quantity} units of ${symbol} at $${price} for portfolio ${portfolioId}`);
    
    const portfolioService = new PortfolioService();
    const transaction = await portfolioService.buyStock(portfolioId, symbol, quantity, price);
    
    // Determine status code based on transaction result
    const statusCode = transaction.status === TransactionStatus.COMPLETED ? 200 : 400;
    
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: transaction.status === TransactionStatus.COMPLETED ? 'success' : 'error',
        data: transaction,
        message: transaction.status === TransactionStatus.COMPLETED 
          ? 'Purchase executed successfully' 
          : transaction.errorMessage || 'Error executing purchase',
      }),
    };
  } catch (error: any) {
    console.error('Error executing purchase:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Error executing purchase',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};
