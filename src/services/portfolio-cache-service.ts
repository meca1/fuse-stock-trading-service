import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

/**
 * Cache service for portfolios
 * Handles caching and invalidation of portfolio data
 */
export class PortfolioCacheService {
  private dynamo: DynamoDBDocument;
  private tableName: string;
  private readonly CACHE_TTL = 300; // 5 minutes
  private isEnabled: boolean = true;

  constructor(
    dynamoDb: DynamoDBDocument,
    tableName: string = process.env.PORTFOLIO_CACHE_TABLE || 'fuse-portfolio-cache-local',
    isEnabled: boolean = true
  ) {
    this.dynamo = dynamoDb;
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
  async checkTableExists(): Promise<boolean> {
    try {
      // We can't use describeTable with DocumentClient, so use a simple get operation
      // with a non-existent key to check if the table exists
      await this.dynamo.get({
        TableName: this.tableName,
        Key: { key: 'table-check-' + Date.now() }
      });
      
      console.log(`[PORTFOLIO CACHE] Table ${this.tableName} exists and is accessible`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Checking for ResourceNotFoundException is not reliable with DocumentClient
      // So we'll just check if we can access the table at all
      if (errorMessage.includes('ResourceNotFoundException')) {
        console.error(`[PORTFOLIO CACHE ERROR] Table ${this.tableName} does not exist:`, errorMessage);
        this.isEnabled = false;
        return false;
      }
      
      // If it's a different error (like permissions), still log but don't disable cache
      // It might be that the key doesn't exist which is fine
      console.log(`[PORTFOLIO CACHE] Table check returned: ${errorMessage}`);
      return true;
    }
  }

  /**
   * Get cached portfolio summary for a user
   */
  async getCachedUserPortfolioSummary(userId: string): Promise<any | null> {
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
      console.log('[PORTFOLIO CACHE] Cache response details', {
        hasItem: !!cacheRes.Item,
        hasData: cacheRes.Item && !!cacheRes.Item.data,
        ttl: cacheRes.Item && cacheRes.Item.ttl,
        currentTime: now,
        ttlExpired: cacheRes.Item && cacheRes.Item.ttl < now,
        userId
      });
      
      if (cacheRes.Item && cacheRes.Item.data && cacheRes.Item.ttl > now) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio for user: ${userId}`);
        return cacheRes.Item.data;
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
  async cacheUserPortfolioSummary(userId: string, data: any): Promise<void> {
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
  async getCachedPortfolioSummary(portfolioId: string): Promise<any | null> {
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
      if (cacheRes.Item && cacheRes.Item.data && cacheRes.Item.ttl > now) {
        console.log(`[PORTFOLIO CACHE HIT] Found cached portfolio: ${portfolioId}`);
        return cacheRes.Item.data;
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
  async cachePortfolioSummary(portfolioId: string, data: any): Promise<void> {
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
   * Called after a transaction to ensure data is fresh
   */
  async invalidateUserCache(userId: string): Promise<void> {
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
   * Called after a transaction to ensure data is fresh
   */
  async invalidatePortfolioCache(portfolioId: string): Promise<void> {
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
   * Find and invalidate all caches related to a user
   * This includes the user's portfolio summary and all individual portfolios
   */
  async invalidateAllUserRelatedCaches(userId: string, portfolioIds: string[]): Promise<void> {
    if (!this.isEnabled) {
      console.log('[PORTFOLIO CACHE] Cache is disabled, skipping invalidation');
      return;
    }
    
    try {
      console.log(`[PORTFOLIO CACHE] Invalidating all caches for user: ${userId} and portfolios: ${portfolioIds}`);
      
      // Invalidate user cache
      await this.invalidateUserCache(userId);
      
      // Invalidate all portfolio caches
      const promises = portfolioIds.map(id => this.invalidatePortfolioCache(id));
      await Promise.all(promises);
      
      console.log(`[PORTFOLIO CACHE] Successfully invalidated all caches for user: ${userId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error invalidating all caches for user ${userId}:`, error);
    }
  }
} 