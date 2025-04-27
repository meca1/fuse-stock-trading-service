import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TransactionType } from '../../types/common/enums';
import { PortfolioService } from '../../services/portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { IPortfolio } from '../../types/models/portfolio';
import { DatabaseService } from '../../config/database';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError } from '../../utils/errors/app-error';

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Validate path parameters
  const symbol = event.pathParameters?.symbol;
  
  if (!symbol) {
    throw new AppError('Stock symbol is required', 400, 'VALIDATION_ERROR');
  }
  
  // Validate request body
  if (!event.body) {
    throw new AppError('Request body is required', 400, 'VALIDATION_ERROR');
  }
  
  const { price, quantity, userId } = JSON.parse(event.body);
  
  if (!price || !quantity || !userId) {
    throw new AppError('Price, quantity, and userId are required', 400, 'VALIDATION_ERROR');
  }
  
  // Get stock details and current price from StockService
  const stockService = StockService.getInstance();
  const stockDetails = await stockService.getStockBySymbol(symbol);
  
  if (!stockDetails) {
    throw new AppError('Stock not found', 404, 'NOT_FOUND');
  }

  // Ensure currentPrice is a number
  const numericCurrentPrice = Number(stockDetails.price);
  if (isNaN(numericCurrentPrice)) {
    throw new AppError('Invalid current price received from service', 500, 'INTERNAL_ERROR');
  }
  
  // Validate price is within 2% of current price
  const priceDiff = Math.abs(price - numericCurrentPrice);
  const maxDiff = numericCurrentPrice * 0.02;
  
  if (priceDiff > maxDiff) {
    throw new AppError(
      `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`,
      400,
      'VALIDATION_ERROR'
    );
  }
  
  // Get or create portfolio for user
  const dbService = await DatabaseService.getInstance();
  const portfolioRepository = new PortfolioRepository(dbService);
  const userRepository = new UserRepository(dbService);
  
  const user = await userRepository.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
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
  const portfolioService = await PortfolioService.getInstance();
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
};

export const handler = wrapHandler(buyStockHandler);
