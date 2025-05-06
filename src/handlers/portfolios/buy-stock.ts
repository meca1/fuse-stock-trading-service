import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TransactionType, TransactionStatus } from '../../types/common/enums';
import { PortfolioService } from '../../services/portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { IPortfolio } from '../../types/models/portfolio';
import { DatabaseService } from '../../config/database';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, ValidationError, NotFoundError, BusinessError, AuthenticationError } from '../../utils/errors/app-error';
import { buyStockParamsSchema, buyStockBodySchema, apiKeySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { PortfolioCacheService } from '../../services/portfolio-cache-service';

// We need to manually define service factory to fix the module not found error
const getStockServiceInstance = (): StockService => {
  // Crear una sola instancia del cliente DynamoDB para toda la función
  const dynamoConfig = {
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  };
  
  const dynamoDb = DynamoDBDocument.from(new DynamoDB(dynamoConfig), {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
  
  // Import these inline to avoid circular dependencies
  const { StockTokenRepository } = require('../../repositories/stock-token-repository');
  const { VendorApiClient } = require('../../services/vendor/api-client');
  const { VendorApiRepository } = require('../../repositories/vendor-api-repository');
  
  const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  
  const stockService = new StockService(stockTokenRepo, vendorApi);
  
  // Verificar tabla de tokens en segundo plano (sin await)
  stockService.checkTableExists(process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local')
    .catch((err: any) => console.warn('Error checking token table:', err));
  
  return stockService;
};

/**
 * Handler to execute a stock purchase
 */
const buyStockHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Marcamos el inicio para medir el rendimiento
  const startTime = Date.now();
  
  console.log('Buy stock handler started', { 
    pathParams: event.pathParameters,
    bodyExists: !!event.body,
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
  
  const dynamoDb = DynamoDBDocument.from(new DynamoDB(dynamoConfig), {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
  const stockService = getStockServiceInstance();
  
  // Inicializar database service en paralelo con la validación
  const dbServicePromise = DatabaseService.getInstance();
  
  try {
    // Esperar la validación de parámetros
    const { symbol, price, quantity, userId, parsedBody } = await paramsPromise;
    
    // Obtener información del stock y DB service en paralelo
    console.log('Fetching stock and database connection in parallel');
    const [stockDetails, dbService] = await Promise.all([
      stockService.getStockBySymbol(symbol),
      dbServicePromise
    ]);
    
    // Inicializar repositorios
    const portfolioRepository = new PortfolioRepository(dbService);
    const userRepository = new UserRepository(dbService);
    const transactionRepository = new (require('../../repositories/transaction-repository').TransactionRepository)(dbService);
    
    // Verificar si el stock se encontró
    let errorReason = '';
    if (!stockDetails) {
      errorReason = `Stock with symbol ${symbol} not found`;
      // Registrar transacción fallida
      await registerFailedTransaction(
        transactionRepository,
        userId,
        symbol,
        quantity,
        price,
        errorReason
      );
      throw new NotFoundError('Stock', symbol);
    }

    // Procesamiento de precio
    const numericCurrentPrice = Number(stockDetails.price);
    if (isNaN(numericCurrentPrice)) {
      errorReason = 'Invalid current price received from service';
      // Registrar transacción fallida
      await registerFailedTransaction(
        transactionRepository,
        userId,
        symbol,
        quantity,
        price,
        errorReason
      );
      throw new AppError(errorReason, 500, 'INTERNAL_ERROR');
    }
    
    // Validar precio (usando el método de validación del stock service)
    if (!stockService.isValidPrice(numericCurrentPrice, price)) {
      const priceInfo = {
        requestedPrice: price,
        currentPrice: numericCurrentPrice,
        difference: Math.abs(price - numericCurrentPrice),
        maximumAllowed: numericCurrentPrice * 0.02
      };
      
      console.log('Price validation failed', priceInfo);
      
      errorReason = `Price must be within 2% of current price ($${numericCurrentPrice.toFixed(2)})`;
      
      // Registrar transacción fallida
      await registerFailedTransaction(
        transactionRepository,
        userId,
        symbol,
        quantity,
        price,
        errorReason
      );
      
      throw new BusinessError(errorReason);
    }
    
    // Obtener datos de usuario y portfolios en paralelo
    const [user, portfolios] = await Promise.all([
      userRepository.findById(userId),
      portfolioRepository.findByUserId(userId)
    ]);
    
    if (!user) {
      errorReason = `User with ID ${userId} not found`;
      // Registrar transacción fallida
      await registerFailedTransaction(
        transactionRepository,
        userId,
        symbol,
        quantity,
        price,
        errorReason
      );
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
      errorReason = 'Failed to determine portfolio for user';
      // Registrar transacción fallida
      await registerFailedTransaction(
        transactionRepository,
        userId,
        symbol,
        quantity,
        price,
        errorReason
      );
      throw new Error(errorReason);
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
  } catch (error) {
    // Propagamos el error para que sea manejado por el wrapper
    throw error;
  }
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

/**
 * Registra una transacción fallida en la base de datos
 */
async function registerFailedTransaction(
  transactionRepository: any,
  userId: string,
  symbol: string,
  quantity: number,
  price: number,
  reason: string
): Promise<void> {
  try {
    // Obtenemos el portfolio del usuario o creamos uno temporal para registrar la transacción fallida
    const dbService = await DatabaseService.getInstance();
    const portfolioRepository = new PortfolioRepository(dbService);
    
    // Intentamos obtener el portfolio del usuario
    const portfolios = await portfolioRepository.findByUserId(userId);
    let portfolioId;
    
    if (portfolios && portfolios.length > 0) {
      portfolioId = portfolios[0].id;
    } else {
      // Si no hay portfolio, creamos uno temporal o usamos un ID predeterminado para transacciones fallidas
      const userRepository = new UserRepository(dbService);
      const user = await userRepository.findById(userId);
      
      if (user) {
        const portfolio = await portfolioRepository.create({
          user_id: userId,
          name: `${user.name}'s Portfolio`
        } as Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>);
        
        portfolioId = portfolio.id;
      } else {
        // Si ni siquiera existe el usuario, usamos un ID genérico (esto debería ser raro)
        portfolioId = 0; // O algún ID especial para transacciones sin portfolio válido
      }
    }
    
    // Registramos la transacción fallida
    await transactionRepository.create({
      portfolio_id: portfolioId,
      stock_symbol: symbol,
      type: TransactionType.BUY,
      quantity,
      price,
      status: TransactionStatus.FAILED,
      notes: reason // Añadir la razón del fallo
    });
    
    console.log(`Failed transaction recorded for user ${userId}, symbol ${symbol}, reason: ${reason}`);
  } catch (error) {
    // Si hay un error al registrar la transacción fallida, solo lo logueamos sin interrumpir el flujo principal
    console.error('Error recording failed transaction:', error);
  }
}

export const handler = wrapHandler(buyStockHandler);
