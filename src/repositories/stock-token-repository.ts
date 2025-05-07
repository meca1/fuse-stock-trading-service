import { CacheService } from '../services/cache-service';

export class StockTokenRepository {
  private cacheService: CacheService;

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
}
