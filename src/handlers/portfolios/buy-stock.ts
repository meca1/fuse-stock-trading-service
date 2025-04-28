import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TransactionType } from '../../types/common/enums';
import { PortfolioService } from '../../services/portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { IPortfolio } from '../../types/models/portfolio';
import { DatabaseService } from '../../config/database';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, ValidationError, NotFoundError, BusinessError } from '../../utils/errors/app-error';
import { buyStockParamsSchema, buyStockBodySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';
import { DynamoDB } from 'aws-sdk';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Validate path parameters
  const paramsResult = buyStockParamsSchema.safeParse(event.pathParameters || {});
  if (!paramsResult.success) {
    throw handleZodError(paramsResult.error);
  }
  const { symbol } = paramsResult.data;
  
  // Validate request body
  if (!event.body) {
    throw new ValidationError('Request body is required');
  }
  
  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body');
  }

  const bodyResult = buyStockBodySchema.safeParse(parsedBody);
  if (!bodyResult.success) {
    throw handleZodError(bodyResult.error);
  }
  const { price, quantity, userId } = bodyResult.data;
  
  // Get stock details and current price from StockService
  const dynamoDb = new DynamoDB.DocumentClient({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  });
  const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  const stockService = new StockService(stockTokenRepo, vendorApi);
  const stockDetails = await stockService.getStockBySymbol(symbol);
  
  if (!stockDetails) {
    throw new NotFoundError('Stock', symbol);
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
    throw new BusinessError(
      `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`
    );
  }
  
  // Get or create portfolio for user
  const dbService = await DatabaseService.getInstance();
  const portfolioRepository = new PortfolioRepository(dbService);
  const userRepository = new UserRepository(dbService);
  
  const user = await userRepository.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User', userId);
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
  const portfolioService = new PortfolioService(
    portfolioRepository,
    new (require('../../repositories/transaction-repository').TransactionRepository)(dbService),
    userRepository,
    stockService
  );
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
