import { CacheService } from '../services/cache-service';

export class StockTokenRepository {
  constructor(
    private cacheService: CacheService
  ) {
    console.log('StockTokenRepository initialized with:', {
      cacheServiceType: cacheService?.constructor?.name,
      hasSetMethod: typeof cacheService?.set === 'function',
      hasGetMethod: typeof cacheService?.get === 'function',
      methods: Object.keys(cacheService || {})
    });
  }

  /**
   * Gets a stock's pagination token from cache
   * @param symbol Stock symbol
   * @returns Token string or null if not found
   */
  async getToken(symbol: string): Promise<string | null> {
    try {
      console.log(`[StockTokenRepository] Searching for token for ${symbol}...`, {
        cacheServiceType: this.cacheService?.constructor?.name,
        hasGetMethod: typeof this.cacheService?.get === 'function'
      });
      
      const result = await this.cacheService.get<{ nextToken: string; lastUpdated: string }>(symbol);
      
      if (result?.nextToken) {
        console.log(`[StockTokenRepository] Token found for ${symbol}: ${result.nextToken}`);
        console.log(`[StockTokenRepository] Last update: ${result.lastUpdated || 'unknown'}`);
        return result.nextToken;
      } else {
        console.log(`[StockTokenRepository] Token not found for ${symbol}`);
        return null;
      }
    } catch (error) {
      console.error(`[StockTokenRepository] Error retrieving token for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Saves or updates a stock's pagination token in cache
   * @param symbol Stock symbol
   * @param nextToken Token string
   */
  async saveToken(symbol: string, nextToken: string): Promise<void> {
    try {
      const data = {
        nextToken,
        lastUpdated: new Date().toISOString()
      };
      
      console.log(`[StockTokenRepository] Saving token for ${symbol}: ${nextToken}`, {
        cacheServiceType: this.cacheService?.constructor?.name,
        hasSetMethod: typeof this.cacheService?.set === 'function',
        data
      });
      
      await this.cacheService.set(symbol, data);
      console.log(`[StockTokenRepository] Token successfully saved for ${symbol}`);
    } catch (error) {
      console.error(`[StockTokenRepository] Error saving token for ${symbol}:`, error);
      throw error;
    }
  }
} 