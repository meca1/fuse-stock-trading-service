import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { TransactionStatus, TransactionType } from '../../models/interfaces';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';

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
    let portfolioId: number;
    try {
      const portfolioRepository = new PortfolioRepository();
      const userRepository = new UserRepository();
      
      // Use a default user ID (1) for demonstration purposes
      const defaultUserId = 1;
      
      // Check if the user exists
      const user = await userRepository.findById(defaultUserId);
      if (!user) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'error',
            message: 'Default user not found',
          }),
        };
      }
      
      // Find the user's portfolios
      const portfolios = await portfolioRepository.findByUserId(defaultUserId);
      
      if (portfolios && portfolios.length > 0) {
        // Use the first portfolio
        portfolioId = portfolios[0].id;
      } else {
        // Create a default portfolio if none exists
        const newPortfolio = await portfolioRepository.create({
          name: 'Default Portfolio',
          user_id: defaultUserId
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
    const transaction = await portfolioService.buyStock({
      portfolioId,
      symbol,
      quantity,
      price
    });
    
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
          : 'Error executing purchase',
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
