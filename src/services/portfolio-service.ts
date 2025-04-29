import { PortfolioRepository } from '../repositories/portfolio-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { IPortfolio, PortfolioStock, PortfolioSummaryResponse } from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { TransactionType, TransactionStatus } from '../types/common/enums';
import { StockService } from './stock-service';
import { UserRepository } from '../repositories/user-repository';
import { PortfolioCacheService } from './portfolio-cache-service';
import { DynamoDB } from 'aws-sdk';

/**
 * Interface for standardized response with cache metadata
 */
interface PortfolioResponseWithCache {
  data: PortfolioSummaryResponse;
  fromCache: boolean;
  timestamp: string;
}

/**
 * Service to handle portfolio-related operations
 */
export class PortfolioService {
  private cacheService: PortfolioCacheService;

  constructor(
    private portfolioRepository: PortfolioRepository,
    private transactionRepository: TransactionRepository,
    private userRepository: UserRepository,
    private stockService: StockService,
    cacheService?: PortfolioCacheService
  ) {
    // If no cache service is provided, create one
    if (!cacheService) {
      const dynamoDb = new DynamoDB.DocumentClient({
        region: process.env.DYNAMODB_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
          secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
        },
        endpoint: process.env.DYNAMODB_ENDPOINT
      });
      this.cacheService = new PortfolioCacheService(dynamoDb);
    } else {
      this.cacheService = cacheService;
    }
  }

  /**
   * Gets all portfolios for a user
   */
  async getUserPortfolios(userId: string): Promise<IPortfolio[]> {
    try {
      const portfolios = await this.portfolioRepository.findByUserId(userId);
      return portfolios;
    } catch (error) {
      console.error(`Error getting portfolios for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Creates a new portfolio for a user
   */
  async createPortfolio(userId: string, name: string): Promise<IPortfolio> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const portfolio = await this.portfolioRepository.create({
        name,
        user_id: userId
      });

      return portfolio;
    } catch (error) {
      console.error(`Error creating portfolio for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Executes a stock purchase
   */
  async executeStockPurchase(
    portfolioId: number,
    symbol: string,
    quantity: number,
    price: number,
    type: TransactionType
  ): Promise<ITransaction> {
    try {
      // Primero verificamos que el stock existe y obtenemos su precio actual
      // Esto se hace en paralelo con la obtención del portfolio
      const [stock, portfolio] = await Promise.all([
        this.stockService.getStockBySymbol(symbol),
        this.portfolioRepository.findById(portfolioId)
      ]);

      if (!stock) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }

      if (!portfolio) {
        throw new Error(`Portfolio with ID ${portfolioId} not found`);
      }

      // Validar el precio
      if (!this.stockService.isValidPrice(stock.price, price)) {
        throw new Error(`Price must be within 2% of current price ($${stock.price})`);
      }

      // Crear la transacción
      const transaction = await this.transactionRepository.create({
        portfolio_id: portfolioId,
        stock_symbol: symbol,
        quantity,
        price,
        type,
        status: TransactionStatus.COMPLETED
      });

      // Iniciamos invalidación de caché en segundo plano, sin esperar su finalización
      this.invalidatePortfolioCaches(portfolio.user_id, portfolioId);

      return transaction;
    } catch (error) {
      console.error('Error executing stock purchase:', error);
      throw error;
    }
  }

  /**
   * Invalidar cachés relacionadas con el portfolio, de forma asíncrona
   * Esta operación se ejecuta en segundo plano, sin bloquear la transacción principal
   */
  private async invalidatePortfolioCaches(userId: string, portfolioId: number): Promise<void> {
    try {
      console.log(`Invalidating caches for user ${userId} and portfolio ${portfolioId}`);
      await this.cacheService.invalidateAllUserRelatedCaches(
        userId, 
        [portfolioId]
      );
      console.log(`Cache invalidated for user ${userId} after transaction`);
    } catch (error) {
      // Solo logeamos el error, no lo propagamos
      console.error(`Error invalidating cache for user ${userId}:`, error);
    }
  }

  /**
   * Gets a summary of all portfolios for a user
   */
  async getUserPortfolioSummary(userId: string): Promise<PortfolioResponseWithCache> {
    try {
      const timestamp = new Date().toISOString();
      // Check cache first
      const cachedData = await this.cacheService.getCachedUserPortfolioSummary(userId);
      
      if (cachedData && cachedData.data) {
        console.log(`Using cached portfolio summary for user: ${userId}`);
        
        // Return standardized response with cache metadata
        return {
          data: cachedData.data,
          fromCache: true,
          timestamp: cachedData.timestamp || timestamp
        };
      }

      const portfolios = await this.portfolioRepository.findByUserId(userId);
      if (!portfolios || portfolios.length === 0) {
        const emptyData = {
          userId,
          totalValue: 0,
          currency: "USD",
          lastUpdated: timestamp,
          stocks: []
        };
        
        const response = {
          data: emptyData,
          fromCache: false,
          timestamp
        };
        
        // Cache empty response
        await this.cacheService.cacheUserPortfolioSummary(userId, {
          data: emptyData,
          timestamp
        });
        
        return response;
      }

      // Por ahora solo manejamos el primer portfolio del usuario
      const portfolio = portfolios[0];
      const summary = await this.getPortfolioSummary(portfolio.id);

      const response = {
        data: summary.data,
        fromCache: false,
        timestamp
      };
      
      // Cache the response
      await this.cacheService.cacheUserPortfolioSummary(userId, {
        data: summary.data,
        timestamp
      });
      
      return response;
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene un resumen completo del portfolio incluyendo el valor actual de las acciones
   */
  async getPortfolioSummary(portfolioId: number): Promise<PortfolioResponseWithCache> {
    try {
      const timestamp = new Date().toISOString();
      // Check cache first
      const cachedData = await this.cacheService.getCachedPortfolioSummary(portfolioId);
      
      if (cachedData) {
        console.log(`Using cached portfolio summary for portfolio: ${portfolioId}`);
        return {
          data: cachedData.data,
          fromCache: true,
          timestamp: cachedData.timestamp || timestamp
        };
      }

      // Obtenemos el portfolio
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }

      // Obtenemos el resumen de las acciones
      const stockSummary = await this.portfolioRepository.getPortfolioStockSummary(portfolioId);

      // Transformamos los datos del resumen de acciones sin necesidad de precios actuales externos
      const stocks = stockSummary.map((summary) => {
        // Usamos el precio de compra como precio de referencia
        const purchasePrice = summary.total_cost / summary.quantity;
        
        return {
          symbol: summary.symbol,
          name: summary.symbol, // Usamos el símbolo como nombre ya que no tenemos el nombre real
          quantity: Number(summary.quantity),
          currentPrice: Number(purchasePrice.toFixed(2)), // Usamos el precio de compra como precio actual
          profitLoss: {
            absolute: 0, // Sin precio actual, no podemos calcular beneficio/pérdida
            percentage: 0
          }
        };
      });

      // Calculamos el valor total del portfolio basado en precios de compra
      const totalValue = stocks.reduce((sum, stock) => sum + (stock.currentPrice * stock.quantity), 0);

      // Actualizamos el valor total en la base de datos
      await this.portfolioRepository.updateValueAndTimestamp(portfolioId, totalValue);

      const portfolioData = {
        userId: portfolio.user_id,
        totalValue: Number(totalValue.toFixed(2)),
        currency: "USD",
        lastUpdated: timestamp,
        stocks
      };

      const response = {
        data: portfolioData,
        fromCache: false,
        timestamp
      };

      // Cache the response
      await this.cacheService.cachePortfolioSummary(portfolioId, {
        data: portfolioData,
        timestamp
      });
      return response;
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene el valor actual del portfolio
   */
  async getPortfolioValue(portfolioId: number): Promise<number> {
    const summary = await this.getPortfolioSummary(portfolioId);
    return summary.data.totalValue;
  }
}
