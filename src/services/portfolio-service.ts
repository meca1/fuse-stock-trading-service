import { PortfolioRepository } from '../repositories/portfolio-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { 
  IPortfolio, 
  PortfolioStock, 
  PortfolioSummaryResponse,
  CachedPortfolioSummary,
  CachedUserPortfolioSummary
} from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { TransactionType, TransactionStatus } from '../types/common/enums';
import { StockService } from './stock-service';
import { UserRepository } from '../repositories/user-repository';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

/**
 * Interface for standardized response with cache metadata
 */
interface PortfolioResponseWithCache {
  data: PortfolioSummaryResponse;
  fromCache: boolean;
  timestamp: string;
}

/**
 * Service to handle portfolio-related operations and caching
 */
export class PortfolioService {
  private dynamo: DynamoDBDocument;
  private tableName: string;
  private readonly CACHE_TTL = 300; // 5 minutes
  private isEnabled: boolean = true;

  constructor(
    private portfolioRepository: PortfolioRepository,
    private transactionRepository: TransactionRepository,
    private userRepository: UserRepository,
    private stockService: StockService,
    dynamoDb?: DynamoDBDocument,
    tableName: string = process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
    isEnabled: boolean = true
  ) {
    // Initialize DynamoDB client if not provided
    if (!dynamoDb) {
      this.dynamo = DynamoDBDocument.from(new DynamoDB({
        region: process.env.DYNAMODB_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
          secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
        },
        endpoint: process.env.DYNAMODB_ENDPOINT
      }), {
        marshallOptions: {
          removeUndefinedValues: true
        }
      });
    } else {
      this.dynamo = dynamoDb;
    }
    
    this.tableName = tableName;
    this.isEnabled = isEnabled;
    
    // Log configuration
    console.log('[PORTFOLIO CACHE] Initialized with configuration', {
      tableName: this.tableName,
      ttl: this.CACHE_TTL,
      isEnabled: this.isEnabled
    });
  }

  /**
   * Generate a cache key for a user's portfolio
   */
  private generateUserPortfolioKey(userId: string): string {
    return `portfolio:user:${userId}`;
  }

  /**
   * Generate a cache key for a specific portfolio
   */
  private generatePortfolioKey(portfolioId: string): string {
    return `portfolio:id:${portfolioId}`;
  }

  /**
   * Check if the cache table exists and is accessible
   */
  private async checkTableExists(): Promise<boolean> {
    try {
      await this.dynamo.get({
        TableName: this.tableName,
        Key: { key: 'table-check-' + Date.now() }
      });
      
      console.log(`[PORTFOLIO CACHE] Table ${this.tableName} exists and is accessible`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('ResourceNotFoundException')) {
        console.error(`[PORTFOLIO CACHE ERROR] Table ${this.tableName} does not exist:`, errorMessage);
        this.isEnabled = false;
        return false;
      }
      
      console.log(`[PORTFOLIO CACHE] Table check returned: ${errorMessage}`);
      return true;
    }
  }

  /**
   * Get cached portfolio summary for a user
   */
  private async getCachedUserPortfolioSummary(userId: string): Promise<CachedUserPortfolioSummary | null> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping read');
      return null;
    }
    
    try {
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio for user: ${userId}`);
      const cacheKey = this.generateUserPortfolioKey(userId);
      
      const cacheRes = await this.dynamo.get({
        TableName: this.tableName,
        Key: { key: cacheKey }
      });
      
      const now = Math.floor(Date.now() / 1000);
      if (cacheRes.Item?.data && cacheRes.Item.ttl > now) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio for user: ${userId}`);
        return cacheRes.Item.data as CachedUserPortfolioSummary;
      } else {
        console.log(`[PORTFOLIO CACHE MISS] No valid cache for user: ${userId}`);
        return null;
      }
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error retrieving cache for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Cache portfolio summary for a user
   */
  private async cacheUserPortfolioSummary(userId: string, data: CachedUserPortfolioSummary): Promise<void> {
    if (!this.isEnabled) {
      console.log('Cache disabled. Skipping cacheUserPortfolioSummary.');
      return;
    }

    try {
      await this.checkTableExists();
      const key = this.generateUserPortfolioKey(userId);
      
      // Ensure data has a timestamp if not provided
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }
      
      const params = {
        TableName: this.tableName,
        Item: {
          key,
          data,
          ttl: Math.floor(Date.now() / 1000) + this.CACHE_TTL
        }
      };
      
      await this.dynamo.put(params);
      console.log(`Cached portfolio summary for user: ${userId}`);
    } catch (error) {
      console.error('Error caching user portfolio summary:', error);
      // No re-throw, cache errors shouldn't fail the operation
    }
  }

  /**
   * Get cached portfolio summary
   */
  private async getCachedPortfolioSummary(portfolioId: string): Promise<CachedPortfolioSummary | null> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping read');
      return null;
    }
    
    try {
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio: ${portfolioId}`);
      const cacheKey = this.generatePortfolioKey(portfolioId);
      
      const cacheRes = await this.dynamo.get({
        TableName: this.tableName,
        Key: { key: cacheKey }
      });
      
      const now = Math.floor(Date.now() / 1000);
      if (cacheRes.Item?.data && cacheRes.Item.ttl > now) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio: ${portfolioId}`);
        return cacheRes.Item.data as CachedPortfolioSummary;
      } else {
        console.log(`[PORTFOLIO CACHE MISS] No valid cache for portfolio: ${portfolioId}`);
        return null;
      }
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error retrieving cache for portfolio ${portfolioId}:`, error);
      return null;
    }
  }

  /**
   * Cache portfolio summary
   */
  private async cachePortfolioSummary(portfolioId: string, data: CachedPortfolioSummary): Promise<void> {
    if (!this.isEnabled) {
      console.log('Cache disabled. Skipping cachePortfolioSummary.');
      return;
    }

    try {
      await this.checkTableExists();
      const key = this.generatePortfolioKey(portfolioId);
      
      // Ensure data has a timestamp if not provided
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }
      
      const params = {
        TableName: this.tableName,
        Item: {
          key,
          data,
          ttl: Math.floor(Date.now() / 1000) + this.CACHE_TTL
        }
      };
      
      await this.dynamo.put(params);
      console.log(`Cached portfolio summary for portfolio: ${portfolioId}`);
    } catch (error) {
      console.error('Error caching portfolio summary:', error);
      // No re-throw, cache errors shouldn't fail the operation
    }
  }

  /**
   * Invalidate cache for a user's portfolio
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping invalidation');
      return;
    }
    
    try {
      console.log(`[PORTFOLIO CACHE] Invalidating cache for user: ${userId}`);
      const cacheKey = this.generateUserPortfolioKey(userId);
      
      await this.dynamo.delete({
        TableName: this.tableName,
        Key: { key: cacheKey }
      });
      
      console.log(`[PORTFOLIO CACHE] Successfully invalidated cache for user: ${userId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error invalidating cache for user ${userId}:`, error);
    }
  }

  /**
   * Invalidate cache for a specific portfolio
   */
  private async invalidatePortfolioCache(portfolioId: string): Promise<void> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping invalidation');
      return;
    }
    
    try {
      console.log(`[PORTFOLIO CACHE] Invalidating cache for portfolio: ${portfolioId}`);
      const cacheKey = this.generatePortfolioKey(portfolioId);
      
      await this.dynamo.delete({
        TableName: this.tableName,
        Key: { key: cacheKey }
      });
      
      console.log(`[PORTFOLIO CACHE] Successfully invalidated cache for portfolio: ${portfolioId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error invalidating cache for portfolio ${portfolioId}:`, error);
    }
  }

  /**
   * Invalidar cachés relacionadas con el portfolio, de forma asíncrona
   */
  private async invalidatePortfolioCaches(userId: string, portfolioId: string): Promise<void> {
    try {
      console.log(`Invalidating caches for user ${userId} and portfolio ${portfolioId}`);
      
      // Invalidate user cache
      await this.invalidateUserCache(userId);
      
      // Invalidate portfolio cache
      await this.invalidatePortfolioCache(portfolioId);
      
      console.log(`Cache invalidated for user ${userId} after transaction`);
    } catch (error) {
      // Solo logeamos el error, no lo propagamos
      console.error(`Error invalidating cache for user ${userId}:`, error);
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
    portfolioId: string,
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

      // Ejecutar la compra a través de la API externa del proveedor
      const buyResponse = await this.stockService.buyStock(symbol, price, quantity);
      
      if (buyResponse.status !== 200) {
        throw new Error(`Error buying stock: ${buyResponse.message}`);
      }

      // Crear la transacción
      const transaction = await this.transactionRepository.create({
        portfolio_id: portfolioId,
        stock_symbol: symbol,
        quantity,
        price,
        type,
        status: TransactionStatus.COMPLETED,
        date: new Date().toISOString()
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
   * Gets a summary of all portfolios for a user
   */
  async getUserPortfolioSummary(userId: string): Promise<PortfolioResponseWithCache> {
    try {
      const timestamp = new Date().toISOString();
      // Check cache first
      const cachedData = await this.getCachedUserPortfolioSummary(userId);
      
      if (cachedData?.data) {
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
        const emptyData: CachedUserPortfolioSummary = {
          data: {
            userId,
            totalValue: 0,
            currency: "USD",
            lastUpdated: timestamp,
            stocks: []
          },
          timestamp
        };
        
        const response = {
          data: emptyData.data,
          fromCache: false,
          timestamp
        };
        
        // Cache empty response
        await this.cacheUserPortfolioSummary(userId, emptyData);
        
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
      await this.cacheUserPortfolioSummary(userId, {
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
  async getPortfolioSummary(portfolioId: string): Promise<PortfolioResponseWithCache> {
    try {
      const timestamp = new Date().toISOString();
      // Check cache first
      const cachedData = await this.getCachedPortfolioSummary(portfolioId);
      
      if (cachedData?.data) {
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

      const portfolioData: CachedPortfolioSummary = {
        data: {
          userId: portfolio.user_id,
          totalValue: Number(totalValue.toFixed(2)),
          currency: "USD",
          lastUpdated: timestamp,
          stocks
        },
        timestamp
      };

      const response = {
        data: portfolioData.data,
        fromCache: false,
        timestamp
      };

      // Cache the response
      await this.cachePortfolioSummary(portfolioId, portfolioData);
      return response;
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene el valor actual del portfolio
   */
  async getPortfolioValue(portfolioId: string): Promise<number> {
    const summary = await this.getPortfolioSummary(portfolioId);
    return summary.data.totalValue;
  }
}
