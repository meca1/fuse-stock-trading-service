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
  const stockService = new StockService();
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
