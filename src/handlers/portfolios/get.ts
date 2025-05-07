import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { listPortfoliosParamsSchema, apiKeySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { DatabaseService } from '../../config/database';
import { CacheService } from '../../services/cache-service';

// Initialize DynamoDB client


// Initialize cache service
const portfolioCacheService = new CacheService({
  tableName: process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
  region: process.env.DYNAMODB_REGION || 'local',
  accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
  secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
});

// We need to manually define service factory to fix the module not found error
const getStockServiceInstance = () => {
  const { StockService } = require('../../services/stock-service');
  const { StockTokenRepository } = require('../../repositories/stock-token-repository');
  const { VendorApiClient } = require('../../services/vendor/api-client');
  const { VendorApiRepository } = require('../../repositories/vendor-api-repository');
  
  const stockTokenRepo = new StockTokenRepository(new CacheService({
    tableName: process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local',
    region: process.env.DYNAMODB_REGION || 'local',
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
  }));
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  return new StockService(stockTokenRepo, vendorApi);
};

/**
 * Handler to get the portfolio summary for a user
 */
const getPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Get portfolios handler started', { 
    pathParams: event.pathParameters,
    headers: {
      'x-api-key-exists': !!event.headers['x-api-key'],
      'X-API-Key-exists': !!event.headers['X-API-Key']
    }
  });

  // 1. Validate API key
  const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
  const apiKeyResult = apiKeySchema.safeParse(apiKey);
  
  if (!apiKeyResult.success) {
    throw handleZodError(apiKeyResult.error);
  }

  if (apiKey !== process.env.VENDOR_API_KEY) {
    throw new AuthenticationError('Invalid API key');
  }
  
  // Log all environment variables related to DynamoDB for debugging
  console.log('DynamoDB Configuration', {
    region: process.env.DYNAMODB_REGION || 'N/A',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'N/A',
    portfolioCacheTable: process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
    stocksTable: process.env.DYNAMODB_TABLE || 'N/A',
    stockCacheTable: process.env.STOCK_CACHE_TABLE || 'N/A'
  });

  // Validate path parameters
  const paramsResult = listPortfoliosParamsSchema.safeParse(event.pathParameters || {});
  
  if (!paramsResult.success) {
    throw handleZodError(paramsResult.error);
  }

  const { userId } = paramsResult.data;

  console.log('Getting portfolio summary for user', {
    level: 'info',
    userId,
    timestamp: new Date().toISOString()
  });
  
  const dbService = await DatabaseService.getInstance();
  const portfolioRepository = new PortfolioRepository(dbService);
  const transactionRepository = new TransactionRepository(dbService);
  const userRepository = new UserRepository(dbService);
  
  // Get the optimized stock service
  const stockService = getStockServiceInstance();
  
  // Create portfolio service with integrated cache
  const portfolioService = new PortfolioService(
    portfolioRepository,
    transactionRepository,
    userRepository,
    stockService,
    portfolioCacheService
  );
  
  // Get portfolio summary (now uses integrated cache)
  console.log(`Requesting portfolio summary for user: ${userId}`);
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'success',
      data: summary.data,
      metadata: {
        cached: summary.fromCache,
        timestamp: summary.timestamp
      }
    })
  };
};

export const handler = wrapHandler(getPortfoliosHandler);
