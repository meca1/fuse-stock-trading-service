import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { TransactionType } from '../../models/interfaces';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { IPortfolio } from '../../models/interfaces';
import { StockRepository } from '../../repositories/stock-repository';

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

    // Get current price from StockService
    const stockService = StockService.getInstance();
    const { price: currentPrice } = await stockService.getCurrentPrice(symbol);

    // Ensure currentPrice is a number
    const numericCurrentPrice = Number(currentPrice);
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
    const stockRepository = new StockRepository();
    
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

    // Ensure stock exists in database
    let stock = await stockRepository.findBySymbol(symbol);
    
    if (!stock) {
      // Get stock details from vendor
      const vendorStock = await stockService.getStockBySymbol(symbol);
      
      if (!vendorStock) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            status: 'error',
            message: 'Stock not found',
            error: 'Stock not found'
          })
        };
      }
      // Create stock in database
      stock = await stockRepository.create({
        symbol: vendorStock.symbol,
        name: vendorStock.name,
        current_price: vendorStock.current_price,
        page_token: vendorStock.page_token,
        last_updated: new Date()
      });
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

    // Update stock price in database after successful purchase
    await stockService.updateStockPrice(symbol, numericCurrentPrice);

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
