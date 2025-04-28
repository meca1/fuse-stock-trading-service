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

/**
 * Handler to get the portfolio summary for a user
 */
const listPortfoliosHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
  const portfolioService = new PortfolioService(
    portfolioRepository,
    transactionRepository,
    userRepository,
    stockService
  );
  const summary = await portfolioService.getUserPortfolioSummary(userId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'success',
      data: summary
    })
  };
};

export const handler = wrapHandler(listPortfoliosHandler);
