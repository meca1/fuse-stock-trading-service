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
  
  // Crear una sola instancia del cliente DynamoDB para toda la función
  const dynamoConfig = {
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  };
  
  const dynamoDb = new DynamoDB.DocumentClient(dynamoConfig);
  
  // Import these inline to avoid circular dependencies
  const { StockTokenRepository } = require('../../repositories/stock-token-repository');
  const { VendorApiClient } = require('../../services/vendor/api-client');
  const { VendorApiRepository } = require('../../repositories/vendor-api-repository');
  const { DailyStockTokenService } = require('../../services/daily-stock-token-service');
  
  const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  
  // Verificar tabla de tokens
  const dailyStockService = new DailyStockTokenService(stockTokenRepo, vendorApi);
  
  // Intentar verificar la tabla de tokens en segundo plano (sin await)
  dailyStockService.checkTableExists(process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local')
    .catch((err: any) => console.warn('Error checking token table:', err));
  
  return new StockService(stockTokenRepo, vendorApi);
};

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Marcamos el inicio para medir el rendimiento
  const startTime = Date.now();
  
  console.log('Buy stock handler started', { 
    pathParams: event.pathParameters,
    bodyExists: !!event.body
  });

  // Obtener y validar parámetros en paralelo con la inicialización de servicios
  const paramsPromise = validateParams(event);
  
  // Inicializar los servicios mientras se validan los parámetros
  const dynamoConfig = {
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  };
  
  const dynamoDb = new DynamoDB.DocumentClient(dynamoConfig);
  const stockService = getStockServiceInstance();
  
  // Inicializar database service en paralelo con la validación
  const dbServicePromise = DatabaseService.getInstance();
  
  // Esperar la validación de parámetros
  const { symbol, price, quantity, userId, parsedBody } = await paramsPromise;
  
  // Obtener información del stock y DB service en paralelo
  console.log('Fetching stock and database connection in parallel');
  const [stockDetails, dbService] = await Promise.all([
    stockService.getStockBySymbol(symbol),
    dbServicePromise
  ]);
  
  if (!stockDetails) {
    throw new NotFoundError('Stock', symbol);
  }

  // Inicializar repositorios
  const portfolioRepository = new PortfolioRepository(dbService);
  const userRepository = new UserRepository(dbService);
  const transactionRepository = new (require('../../repositories/transaction-repository').TransactionRepository)(dbService);
  
  // Procesamiento de precio
  const numericCurrentPrice = Number(stockDetails.price);
  if (isNaN(numericCurrentPrice)) {
    throw new AppError('Invalid current price received from service', 500, 'INTERNAL_ERROR');
  }
  
  // Validar precio (usando el método de validación del stock service)
  if (!stockService.isValidPrice(numericCurrentPrice, price)) {
    console.log('Price validation failed', {
      requestedPrice: price,
      currentPrice: numericCurrentPrice,
      difference: Math.abs(price - numericCurrentPrice),
      maximumAllowed: numericCurrentPrice * 0.02
    });
    throw new BusinessError(
      `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`
    );
  }
  
  // Obtener datos de usuario y portfolios en paralelo
  const [user, portfolios] = await Promise.all([
    userRepository.findById(userId),
    portfolioRepository.findByUserId(userId)
  ]);
  
  if (!user) {
    throw new NotFoundError('User', userId);
  }
  
  // Determinar el portfolio a utilizar y crear servicios mientras tanto
  let portfolioPromise;
  let createPortfolioPromise;
  
  if (!portfolios || portfolios.length === 0) {
    // Iniciar la creación del portfolio sin await
    createPortfolioPromise = portfolioRepository.create({
      user_id: userId,
      name: `${user.name}'s Portfolio`
    } as Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>);
  }

  // Inicializar servicio de portfolio con cache
  const portfolioCacheService = new PortfolioCacheService(
    dynamoDb,
    process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local'
  );
  
  const portfolioService = new PortfolioService(
    portfolioRepository,
    transactionRepository,
    userRepository,
    stockService,
    portfolioCacheService
  );
  
  // Resolver el portfolio (esperar creación si fue necesario)
  const portfolio = (!portfolios || portfolios.length === 0) 
    ? await createPortfolioPromise!
    : portfolios[0];
    
  if (!portfolio) {
    throw new Error('Failed to determine portfolio for user');
  }
  
  // Ejecutar la compra
  console.log(`Executing stock purchase for portfolio ${portfolio.id}, user ${userId}`);
  const transaction = await portfolioService.executeStockPurchase(
    portfolio.id,
    symbol,
    quantity,
    price,
    TransactionType.BUY
  );
  
  // Medir tiempo de ejecución
  const executionTime = Date.now() - startTime;
  console.log(`Purchase executed in ${executionTime}ms`, {
    transactionId: transaction.id,
    portfolio: portfolio.id,
    symbol,
    quantity,
    price
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'success',
      data: {
        ...transaction,
        currentPrice: numericCurrentPrice
      },
      message: 'Purchase executed successfully',
      executionTime: `${executionTime}ms`
    })
  };
};

/**
 * Valida y extrae los parámetros de la petición
 */
async function validateParams(event: APIGatewayProxyEvent): Promise<{
  symbol: string;
  price: number;
  quantity: number;
  userId: string;
  parsedBody: any;
}> {
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
  
  return { symbol, price, quantity, userId, parsedBody };
}

export const handler = wrapHandler(buyStockHandler);
