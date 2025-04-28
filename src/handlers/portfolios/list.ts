import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PortfolioService } from '../../services/portfolio-service';
import { AppError } from '../../utils/errors/app-error';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { listPortfoliosParamsSchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { DatabaseService } from '../../config/database';
import { DynamoDB } from 'aws-sdk';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { PortfolioCacheService } from '../../services/portfolio-cache-service';

// We need to manually define service factory to fix the module not found error
const getStockServiceInstance = () => {
  const { StockService } = require('../../services/stock-service');
  const { StockTokenRepository } = require('../../repositories/stock-token-repository');
  const { VendorApiClient } = require('../../services/vendor/api-client');
  const { VendorApiRepository } = require('../../repositories/vendor-api-repository');
  
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
  return new StockService(stockTokenRepo, vendorApi);
};

/**
 * Handler to get the portfolio summary for a user
 */
const listPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
  
  // Setup DynamoDB for cache service
  const dynamoDb = new DynamoDB.DocumentClient({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  });
  
  // Create the cache service
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
  
  // Get the optimized stock service
  const stockService = getStockServiceInstance();
  
  // Create portfolio service with cache
  const portfolioService = new PortfolioService(
    portfolioRepository,
    transactionRepository,
    userRepository,
    stockService,
    portfolioCacheService
  );
  
  // Get portfolio summary (now uses cache)
  console.log(`Requesting portfolio summary for user: ${userId}`);
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'success',
      data: summary,
      metadata: {
        cached: !!summary.isCached
      }
    })
  };
};

export const handler = wrapHandler(listPortfoliosHandler);
