import { CacheService } from '../services/cache-service';
import { StockCache } from '../types/models/stock';

export class StockTokenRepository {
  private cacheService: CacheService;
  private stockCache: StockCache = {};

  constructor() {
    this.cacheService = new CacheService({
      tableName: process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local',
      region: process.env.DYNAMODB_REGION || 'local',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    });
  }

  /**
   * Creates and initializes a new instance of StockTokenRepository
   * @returns Promise with initialized StockTokenRepository instance
   */
  public static async initialize(): Promise<StockTokenRepository> {
    return new StockTokenRepository();
  }

  /**
   * Saves a stock token
   */
  async saveToken(symbol: string, token: string): Promise<void> {
    try {
      await this.cacheService.set(symbol, { token, lastUpdated: new Date().toISOString() });
    } catch (error) {
      console.error(`Error saving token for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Gets a stock token
   */
  async getToken(symbol: string): Promise<string | null> {
    try {
      const data = await this.cacheService.get<{ token: string; lastUpdated: string }>(symbol);
      return data?.token || null;
    } catch (error) {
      console.error(`Error getting token for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Checks if the table exists
   */
  async checkTableExists(): Promise<boolean> {
    try {
      return await this.cacheService.checkTableExists();
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets a cached stock
   */
  async getCachedStock(symbol: string): Promise<any | null> {
    try {
      return await this.cacheService.get(`stock:${symbol}`);
    } catch (error) {
      console.error(`Error getting cached stock for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Caches a stock
   */
  async cacheStock(symbol: string, data: any, ttl: number): Promise<void> {
    try {
      await this.cacheService.set(`stock:${symbol}`, {
        data,
        lastUpdated: new Date().toISOString()
      }, ttl);
    } catch (error) {
      console.error(`Error caching stock for ${symbol}:`, error);
    }
  }

  /**
   * Gets cached stocks with pagination
   */
  async getCachedStocks(baseKey: string, nextToken?: string): Promise<any | null> {
    try {
      const cacheKey = nextToken ? `${baseKey}:page:${nextToken}` : baseKey;
      const result = await this.cacheService.get<{ data: any; lastUpdated: string }>(cacheKey);
      return result?.data || null;
    } catch (error) {
      console.error(`Error getting cached stocks for key ${baseKey}:`, error);
      return null;
    }
  }

  /**
   * Caches stocks with pagination
   */
  async cacheStocks(baseKey: string, data: any, ttl: number, nextToken?: string): Promise<void> {
    try {
      const cacheKey = nextToken ? `${baseKey}:page:${nextToken}` : baseKey;
      await this.cacheService.set(cacheKey, {
        data,
        lastUpdated: new Date().toISOString()
      }, ttl);
    } catch (error) {
      console.error(`Error caching stocks for key ${baseKey}:`, error);
    }
  }
}
