import { CacheService } from '../services/cache-service';
import { ListStocksResult } from '../types/models/stock';

export class StockCacheRepository {
  private cacheService: CacheService;

  constructor() {
    this.cacheService = new CacheService({
      tableName: process.env.DYNAMODB_TABLE || 'fuse-stock-cache-local',
      region: process.env.DYNAMODB_REGION || 'local',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    });
  }

  /**
   * Creates and initializes a new instance of StockCacheRepository
   * @returns Promise with initialized StockCacheRepository instance
   */
  public static async initialize(): Promise<StockCacheRepository> {
    return new StockCacheRepository();
  }

  /**
   * Gets cached stocks with pagination
   */
  async getCachedStocks(baseKey: string, nextToken?: string): Promise<ListStocksResult | null> {
    try {
      const cacheKey = nextToken ? `${baseKey}:page:${nextToken}` : baseKey;
      const result = await this.cacheService.get<{ data: ListStocksResult; lastUpdated: string }>(cacheKey);
      return result?.data || null;
    } catch (error) {
      console.error(`Error getting cached stocks for key ${baseKey}:`, error);
      return null;
    }
  }

  /**
   * Caches stocks with pagination
   */
  async cacheStocks(baseKey: string, data: ListStocksResult, ttl: number, nextToken?: string): Promise<void> {
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