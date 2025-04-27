import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TransactionType } from '../../types/common/enums';
import { PortfolioService } from '../../services/portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { IPortfolio } from '../../types/models/portfolio';

/**
 * Handler to execute a stock purchase
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Validate path parameters
    const symbol = event.pathParameters?.symbol;
    
    if (!symbol) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          status: 'error',
          message: 'Stock symbol is required',
          error: 'Stock symbol is required'
        })
      };
    }
    
    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          status: 'error',
          message: 'Request body is required',
          error: 'Request body is required'
        })
      };
    }
    
    const { price, quantity, userId } = JSON.parse(event.body);
    
    if (!price || !quantity || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          status: 'error',
          message: 'Price, quantity, and userId are required',
          error: 'Price, quantity, and userId are required'
        })
      };
    }
    
    // Get stock details and current price from StockService
    const stockService = StockService.getInstance();
    const stockDetails = await stockService.getStockBySymbol(symbol);
    
    if (!stockDetails) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          status: 'error',
          message: 'Stock not found',
          error: 'Stock not found'
        })
      };
    }

    // Ensure currentPrice is a number
    const numericCurrentPrice = Number(stockDetails.price);
    if (isNaN(numericCurrentPrice)) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          status: 'error',
          message: 'Invalid current price received from service',
          error: 'Invalid current price received from service'
        })
      };
    }
    
    // Validate price is within 2% of current price
    const priceDiff = Math.abs(price - numericCurrentPrice);
    const maxDiff = numericCurrentPrice * 0.02;
    
    if (priceDiff > maxDiff) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          status: 'error',
          message: `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`,
          error: `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`
        })
      };
    }
    
    // Get or create portfolio for user
    const portfolioRepository = new PortfolioRepository();
    const userRepository = new UserRepository();
    
    const user = await userRepository.findById(userId);
    
    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          status: 'error',
          message: 'User not found',
          error: 'User not found'
        })
      };
    }
    
    const portfolios = await portfolioRepository.findByUserId(userId);
    
    let portfolio: IPortfolio;

    if (!portfolios || portfolios.length === 0) {
      portfolio = await portfolioRepository.create({
        user_id: userId,
        name: `${user.name}'s Portfolio`
      } as Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>);
    } else {
      portfolio = portfolios[0];
    }

    // Execute purchase
    const portfolioService = new PortfolioService();
    const transaction = await portfolioService.executeStockPurchase(
      portfolio.id,
      symbol,
      quantity,
      price,
      TransactionType.BUY
    );
      
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        data: {
          ...transaction,
          currentPrice: numericCurrentPrice
        },
        message: 'Purchase executed successfully'
      })
    };
  } catch (error) {
    console.error('Error executing stock purchase:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        message: 'Error executing stock purchase',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
