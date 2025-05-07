import { DatabaseService } from '../config/database';
import { IPortfolio, PortfolioStock, CachedPortfolioSummary, CachedUserPortfolioSummary } from '../types/models/portfolio';
import { PortfolioRepositoryError } from '../utils/errors/repository-error';
import { CacheService } from '../services/cache-service';

/**
 * Repository for portfolio-related database operations
 */
export class PortfolioRepository {
  private cacheService: CacheService;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(private readonly db: DatabaseService) {
    this.cacheService = new CacheService({
      tableName: process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
      region: process.env.DYNAMODB_REGION || 'local',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    });
  }

  /**
   * Creates and initializes a new instance of PortfolioRepository
   * @returns Promise with initialized PortfolioRepository instance
   */
  public static async initialize(): Promise<PortfolioRepository> {
    const dbService = await DatabaseService.getInstance();
    return new PortfolioRepository(dbService);
  }

  /**
   * Gets a cached summary
   */
  async getCachedSummary<T>(key: string): Promise<T | null> {
    try {
      return await this.cacheService.get<T>(key);
    } catch (error) {
      console.error(`Error getting cached summary for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Caches a summary
   */
  async cacheSummary<T>(key: string, data: T, ttl: number): Promise<void> {
    try {
      await this.cacheService.set(key, data, ttl);
    } catch (error) {
      console.error(`Error caching summary for key ${key}:`, error);
    }
  }

  /**
   * Invalidates a cached summary
   */
  async invalidateCache(key: string): Promise<void> {
    try {
      await this.cacheService.delete(key);
    } catch (error) {
      console.error(`Error invalidating cache for key ${key}:`, error);
    }
  }

  /**
   * Validates a portfolio ID
   * @throws {PortfolioRepositoryError} If the ID is invalid
   */
  private validatePortfolioId(id: string): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new PortfolioRepositoryError('Invalid portfolio ID');
    }
  }

  /**
   * Validates a user ID
   * @throws {PortfolioRepositoryError} If the ID is invalid
   */
  private validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new PortfolioRepositoryError('Invalid user ID');
    }
  }

  /**
   * Finds a portfolio by its ID
   */
  async findById(id: string): Promise<IPortfolio | null> {
    try {
      this.validatePortfolioId(id);

      const result = await this.db.query('SELECT * FROM portfolios WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding portfolio by ID:', error);
      throw new PortfolioRepositoryError(
        `Failed to find portfolio with ID ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Finds all portfolios for a user
   */
  async findByUserId(userId: string): Promise<IPortfolio[]> {
    try {
      this.validateUserId(userId);

      const result = await this.db.query(
        'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC',
        [userId],
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding portfolios by user ID:', error);
      throw new PortfolioRepositoryError(
        `Failed to find portfolios for user ${userId}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Creates a new portfolio
   */
  async create(
    portfolio: Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<IPortfolio> {
    try {
      this.validateUserId(portfolio.user_id);

      if (!portfolio.name || portfolio.name.trim().length === 0) {
        throw new PortfolioRepositoryError('Portfolio name is required');
      }

      const result = await this.db.query(
        'INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING *',
        [portfolio.user_id, portfolio.name.trim()],
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating portfolio:', error);
      throw new PortfolioRepositoryError(
        'Failed to create portfolio',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Gets a summary of stocks in a portfolio
   */
  async getPortfolioStockSummary(portfolioId: string): Promise<PortfolioStock[]> {
    try {
      this.validatePortfolioId(portfolioId);

      const result = await this.db.query(
        `
        WITH stock_summary AS (
          SELECT 
            stock_symbol as symbol,
            SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) as quantity,
            SUM(CASE WHEN type = 'BUY' THEN quantity * price ELSE -quantity * price END) as total_cost
          FROM transactions 
          WHERE portfolio_id = $1 AND status = 'COMPLETED'
          GROUP BY stock_symbol
        )
        SELECT * FROM stock_summary
        WHERE quantity > 0
        ORDER BY symbol
      `,
        [portfolioId],
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting portfolio stock summary:', error);
      throw new PortfolioRepositoryError(
        `Failed to get stock summary for portfolio ${portfolioId}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Updates the total value and timestamp of a portfolio
   */
  async updateValueAndTimestamp(id: string, value: number): Promise<void> {
    try {
      this.validatePortfolioId(id);

      if (value < 0) {
        throw new PortfolioRepositoryError('Portfolio value cannot be negative');
      }

      await this.db.query(
        'UPDATE portfolios SET total_value = $1, updated_at = NOW() WHERE id = $2',
        [value, id],
      );
    } catch (error) {
      console.error('Error updating portfolio value:', error);
      throw new PortfolioRepositoryError(
        `Failed to update portfolio value for portfolio ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
