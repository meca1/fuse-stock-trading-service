import { PortfolioRepository } from '../repositories/portfolio-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { UserRepository } from '../repositories/user-repository';
import { VendorApiRepository } from '../repositories/vendor-api-repository';
import { PortfolioCacheRepository } from '../repositories/portfolio-cache-repository';
import {
  IPortfolio,
  PortfolioSummaryResponse,
  CachedPortfolioSummary,
  CachedUserPortfolioSummary,
  PortfolioResponseWithCache,
} from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { TransactionType, TransactionStatus } from '../types/common/enums';

/**
 * Service to handle portfolio-related operations and caching
 */
export class PortfolioService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private isEnabled: boolean = true;

  constructor(
    private portfolioRepository: PortfolioRepository,
    private transactionRepository: TransactionRepository,
    private userRepository: UserRepository,
    private vendorApiRepository: VendorApiRepository,
    private portfolioCacheRepo: PortfolioCacheRepository,
  ) {}

  /**
   * Creates and initializes a new instance of PortfolioService with all required dependencies
   * @returns Promise with initialized PortfolioService instance
   */
  public static async initialize(): Promise<PortfolioService> {
    const portfolioRepository = await PortfolioRepository.initialize();
    const transactionRepository = await TransactionRepository.initialize();
    const userRepository = await UserRepository.initialize();
    const vendorApiRepository = new VendorApiRepository({});
    const portfolioCacheRepo = new PortfolioCacheRepository();

    return new PortfolioService(
      portfolioRepository,
      transactionRepository,
      userRepository,
      vendorApiRepository,
      portfolioCacheRepo,
    );
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
   * Get cached portfolio summary for a user
   */
  private async getCachedUserPortfolioSummary(
    userId: string,
  ): Promise<CachedUserPortfolioSummary | null> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping read');
      return null;
    }

    try {
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio for user: ${userId}`);
      const cachedData = await this.portfolioCacheRepo.getPortfolioSummary(userId);
      
      if (cachedData) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio for user: ${userId}`);
        return {
          data: cachedData.data,
          timestamp: cachedData.timestamp,
        };
      }

      console.log(`[PORTFOLIO CACHE MISS] No valid cache for user: ${userId}`);
      return null;
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error retrieving cache for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Cache portfolio summary for a user
   */
  private async cacheUserPortfolioSummary(
    userId: string,
    data: CachedUserPortfolioSummary,
  ): Promise<void> {
    if (!this.isEnabled) {
      console.log('Cache disabled. Skipping cacheUserPortfolioSummary.');
      return;
    }

    try {
      await this.portfolioCacheRepo.cachePortfolioSummary(userId, data.data);
      console.log(`Cached portfolio summary for user: ${userId}`);
    } catch (error) {
      console.error('Error caching user portfolio summary:', error);
    }
  }

  /**
   * Get cached portfolio summary
   */
  private async getCachedPortfolioSummary(
    portfolioId: string,
  ): Promise<CachedPortfolioSummary | null> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping read');
      return null;
    }

    try {
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio: ${portfolioId}`);
      const cachedData = await this.portfolioCacheRepo.getPortfolioSummary(portfolioId);
      
      if (cachedData) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio: ${portfolioId}`);
        return cachedData;
      }

      console.log(`[PORTFOLIO CACHE MISS] No valid cache for portfolio: ${portfolioId}`);
      return null;
    } catch (error) {
      console.error(
        `[PORTFOLIO CACHE ERROR] Error retrieving cache for portfolio ${portfolioId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache portfolio summary
   */
  private async cachePortfolioSummary(
    portfolioId: string,
    data: CachedPortfolioSummary,
  ): Promise<void> {
    if (!this.isEnabled) {
      console.log('Cache disabled. Skipping cachePortfolioSummary.');
      return;
    }

    try {
      await this.portfolioCacheRepo.cachePortfolioSummary(portfolioId, data.data);
      console.log(`Cached portfolio summary for portfolio: ${portfolioId}`);
    } catch (error) {
      console.error('Error caching portfolio summary:', error);
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

      await this.portfolioCacheRepo.invalidateCache(userId);
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

      await this.portfolioCacheRepo.invalidateCache(portfolioId);
      console.log(`[PORTFOLIO CACHE] Successfully invalidated cache for portfolio: ${portfolioId}`);
    } catch (error) {
      console.error(
        `[PORTFOLIO CACHE ERROR] Error invalidating cache for portfolio ${portfolioId}:`,
        error,
      );
    }
  }

  /**
   * Invalidar cachés relacionadas con el portfolio, de forma asíncrona
   */
  private async invalidatePortfolioCaches(userId: string, portfolioId: string): Promise<void> {
    try {
      console.log(`Invalidating cache for user ${userId}`);
      const cacheKey = this.generateUserPortfolioKey(userId);
      await this.portfolioCacheRepo.invalidateCache(userId);
      console.log(`Cache invalidated for user ${userId} after transaction`);
    } catch (error) {
      console.error(`Error invalidating cache for user ${userId}:`, error);
    }
  }

  /**
   * Gets all portfolios for a user
   */
  public async getUserPortfolios(userId: string): Promise<IPortfolio[]> {
    try {
      // Try to get from cache first
      const cachedPortfolios = await this.portfolioCacheRepo.getPortfolios(userId);
      if (cachedPortfolios) {
        return cachedPortfolios;
      }

      // If not in cache, get from database
      const portfolios = await this.portfolioRepository.findByUserId(userId);
      
      // Cache the result
      await this.portfolioCacheRepo.cachePortfolios(userId, portfolios);
      
      return portfolios;
    } catch (error) {
      throw new Error(
        `Error getting user portfolios: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
        user_id: userId,
      });

      // Cache the new portfolio
      await this.portfolioCacheRepo.cachePortfolios(userId, [portfolio]);

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
    type: TransactionType,
  ): Promise<ITransaction> {
    try {
      // Obtener portfolio y stock en paralelo
      const [portfolio, stock] = await Promise.all([
        this.portfolioRepository.findById(portfolioId),
        this.vendorApiRepository.getStock(symbol),
      ]);

      if (!portfolio) {
        throw new Error(`Portfolio with ID ${portfolioId} not found`);
      }

      if (!stock) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }

      // Validar el precio (2% de variación permitida)
      const numericCurrentPrice = Number(stock.price);
      const priceDiff = Number(Math.abs(numericCurrentPrice - price).toFixed(4));
      const maxDiff = Number((numericCurrentPrice * 0.02).toFixed(4));

      if (priceDiff > maxDiff) {
        const minPrice = Number((numericCurrentPrice * 0.98).toFixed(4));
        const maxPrice = Number((numericCurrentPrice * 1.02).toFixed(4));
        throw new Error(
          `Invalid price. Current price is $${numericCurrentPrice.toFixed(4)}. Your price must be within 2% ($${maxDiff.toFixed(4)}) of the current price. Valid range: $${minPrice} - $${maxPrice}`,
        );
      }

      // Ejecutar la compra y crear la transacción en paralelo
      const [buyResponse, transaction] = await Promise.all([
        this.vendorApiRepository.buyStock(symbol, { price, quantity }),
        this.transactionRepository.create({
          portfolio_id: portfolioId,
          stock_symbol: symbol,
          quantity,
          price,
          type,
          status: TransactionStatus.COMPLETED,
          date: new Date().toISOString(),
        }),
      ]);

      if (buyResponse.status !== 200) {
        throw new Error(`Error buying stock: ${buyResponse.message}`);
      }

      // Invalidate cache after successful purchase
      await this.portfolioCacheRepo.invalidateCache(portfolio.user_id);

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
      const cachedSummary = await this.portfolioCacheRepo.getPortfolioSummary(userId);
      if (cachedSummary) {
        return {
          data: cachedSummary.data,
          fromCache: true,
          timestamp: cachedSummary.timestamp,
        };
      }

      // If not in cache, get from database
      const portfolios = await this.getUserPortfolios(userId);
      
      if (!portfolios || portfolios.length === 0) {
        const emptyData: PortfolioSummaryResponse = {
          userId,
          totalValue: 0,
          currency: 'USD',
          lastUpdated: timestamp,
          stocks: [],
        };

        // Cache empty response
        await this.portfolioCacheRepo.cachePortfolioSummary(userId, emptyData);

        return {
          data: emptyData,
          fromCache: false,
          timestamp,
        };
      }

      // Por ahora solo manejamos el primer portfolio del usuario
      const portfolio = portfolios[0];
      const stockSummary = await this.portfolioRepository.getPortfolioStockSummary(portfolio.id);
      
      // Transformamos los datos del resumen de acciones
      const stocks = stockSummary.map(summary => {
        const purchasePrice = summary.total_cost / summary.quantity;
        return {
          symbol: summary.symbol,
          name: summary.symbol,
          quantity: Number(summary.quantity),
          currentPrice: Number(purchasePrice.toFixed(2)),
          profitLoss: {
            absolute: 0,
            percentage: 0,
          },
        };
      });

      // Calculamos el valor total del portfolio
      const totalValue = stocks.reduce(
        (sum, stock) => sum + stock.currentPrice * stock.quantity,
        0,
      );

      // Actualizamos el valor total en la base de datos
      await this.portfolioRepository.updateValueAndTimestamp(portfolio.id, totalValue);

      const summaryData: PortfolioSummaryResponse = {
        userId: portfolio.user_id,
        totalValue: Number(totalValue.toFixed(2)),
        currency: 'USD',
        lastUpdated: timestamp,
        stocks,
      };

      // Cache the response
      await this.portfolioCacheRepo.cachePortfolioSummary(userId, summaryData);

      return {
        data: summaryData,
        fromCache: false,
        timestamp,
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Executes a stock purchase for a user
   */
  async buyStock(
    userId: string,
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<ITransaction> {
    try {
      // Get or create portfolio
      const cachedPortfolios = await this.portfolioCacheRepo.getPortfolios(userId);
      let portfolio;

      if (cachedPortfolios && cachedPortfolios.length > 0) {
        console.log(`[PORTFOLIO CACHE HIT] Found valid cache for user: ${userId}`);
        portfolio = cachedPortfolios[0];
      } else {
        console.log(`[PORTFOLIO CACHE MISS] No valid cache for user: ${userId}`);
        const portfolios = await this.portfolioRepository.findByUserId(userId);
        
        if (!portfolios || portfolios.length === 0) {
          console.log(`Creating new portfolio for user: ${userId}`);
          portfolio = await this.createPortfolio(userId, 'Default Portfolio');
        } else {
          portfolio = portfolios[0];
        }

        // Cache the portfolio
        await this.portfolioCacheRepo.cachePortfolios(userId, [portfolio]);
      }

      if (!portfolio || !portfolio.id) {
        throw new Error(`Failed to get or create portfolio for user: ${userId}`);
      }

      // Execute the purchase
      const transaction = await this.executeStockPurchase(
        portfolio.id,
        symbol,
        quantity,
        price,
        TransactionType.BUY,
      );

      // Invalidate cache after purchase
      await this.portfolioCacheRepo.invalidateCache(userId);

      return transaction;
    } catch (error) {
      console.error('Error buying stock:', error);
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
          timestamp: cachedData.timestamp || timestamp,
        };
      }

      // Obtenemos el portfolio
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio with ID ${portfolioId} not found`);
      }

      const stockSummary = await this.portfolioRepository.getPortfolioStockSummary(portfolio.id);
      
      // Transformamos los datos del resumen de acciones
      const stocks = stockSummary.map(summary => {
        const purchasePrice = summary.total_cost / summary.quantity;
        return {
          symbol: summary.symbol,
          name: summary.symbol,
          quantity: Number(summary.quantity),
          currentPrice: Number(purchasePrice.toFixed(2)),
          profitLoss: {
            absolute: 0,
            percentage: 0,
          },
        };
      });

      // Calculamos el valor total del portfolio
      const totalValue = stocks.reduce(
        (sum, stock) => sum + stock.currentPrice * stock.quantity,
        0,
      );

      // Actualizamos el valor total en la base de datos
      await this.portfolioRepository.updateValueAndTimestamp(portfolio.id, totalValue);

      const summaryData: PortfolioSummaryResponse = {
        userId: portfolio.user_id,
        totalValue: Number(totalValue.toFixed(2)),
        currency: 'USD',
        lastUpdated: timestamp,
        stocks,
      };

      // Cache the response
      const cacheData: CachedPortfolioSummary = {
        data: summaryData,
        timestamp,
      };
      await this.portfolioCacheRepo.cachePortfolioSummary(portfolioId, summaryData);
      console.log(`Cached portfolio summary for portfolio: ${portfolioId}`);

      return {
        data: summaryData,
        fromCache: false,
        timestamp,
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }
}