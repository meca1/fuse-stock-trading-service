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
import { PortfolioCacheService } from '../../services/portfolio-cache-service';

// We need to manually define service factory to fix the module not found error
const getStockServiceInstance = (): StockService => {
  const { DynamoDB } = require('aws-sdk');
  const dynamoDb = new DynamoDB.DocumentClient({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  });
  
  // Import these inline to avoid circular dependencies
  const { StockTokenRepository } = require('../../repositories/stock-token-repository');
  const { VendorApiClient } = require('../../services/vendor/api-client');
  const { VendorApiRepository } = require('../../repositories/vendor-api-repository');
  
  const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  return new StockService(stockTokenRepo, vendorApi);
};

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Buy stock handler started', { 
    pathParams: event.pathParameters,
    bodyExists: !!event.body
  });

  // Log all environment variables related to DynamoDB for debugging
  console.log('DynamoDB Configuration', {
    region: process.env.DYNAMODB_REGION || 'N/A',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'N/A',
    portfolioCacheTable: process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
    stocksTable: process.env.DYNAMODB_TABLE || 'N/A',
    stockCacheTable: process.env.STOCK_CACHE_TABLE || 'N/A'
  });

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
  
  // Get stock details and current price from StockService using our cached service
  const stockService = getStockServiceInstance();
  console.log(`[STOCK REQUEST] Getting stock details for symbol: ${symbol}`);
  const stockDetails = await stockService.getStockBySymbol(symbol);
  
  if (!stockDetails) {
    throw new NotFoundError('Stock', symbol);
  }

  console.log('Stock details retrieved', { 
    symbol, 
    stockPrice: stockDetails.price,
    requestedPrice: price
  });

  // Ensure currentPrice is a number
  const numericCurrentPrice = Number(stockDetails.price);
  if (isNaN(numericCurrentPrice)) {
    throw new AppError('Invalid current price received from service', 500, 'INTERNAL_ERROR');
  }
  
  // Validate price is within 2% of current price
  const priceDiff = Math.abs(price - numericCurrentPrice);
  const maxDiff = numericCurrentPrice * 0.02;
  
  if (priceDiff > maxDiff) {
    console.log('Price validation failed', {
      requestedPrice: price,
      currentPrice: numericCurrentPrice,
      difference: priceDiff,
      maximumAllowed: maxDiff
    });
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

  // Create cache service for portfolio
  const dynamoDb = new DynamoDB.DocumentClient({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  });
  
  const portfolioCacheService = new PortfolioCacheService(
    dynamoDb,
    process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local'
  );
  
  // Check if the cache table exists
  try {
    const tableExists = await portfolioCacheService.checkTableExists();
    console.log(`Portfolio cache table check result: ${tableExists ? 'Table exists' : 'Table does not exist'}`);
  } catch (error) {
    console.error('Error checking if portfolio cache table exists:', error);
    // We'll continue anyway, the cache service will disable itself if needed
  }

  // Execute purchase with enhanced portfolio service that supports caching
  const portfolioService = new PortfolioService(
    portfolioRepository,
    new (require('../../repositories/transaction-repository').TransactionRepository)(dbService),
    userRepository,
    stockService,  // Using our cached stockService instance
    portfolioCacheService  // Providing the cache service
  );
  
  console.log(`Executing stock purchase for portfolio ${portfolio.id}, user ${userId}`);
  const transaction = await portfolioService.executeStockPurchase(
    portfolio.id,
    symbol,
    quantity,
    price,
    TransactionType.BUY
  );
    
  console.log('Purchase executed successfully', {
    transactionId: transaction.id,
    portfolio: portfolio.id,
    symbol,
    quantity,
    price
  });

  // After purchase, immediately invalidate the cache
  await portfolioCacheService.invalidateAllUserRelatedCaches(userId, [portfolio.id]);
  console.log(`Manually triggered cache invalidation for user ${userId} and portfolio ${portfolio.id}`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'success',
      data: {
        ...transaction,
        currentPrice: numericCurrentPrice
      },
      message: 'Purchase executed successfully',
      cacheInvalidated: true
    })
  };
};

export const handler = wrapHandler(buyStockHandler);
