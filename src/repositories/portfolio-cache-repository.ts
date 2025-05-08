import { CacheService } from '../services/cache-service';
import { IPortfolio, PortfolioSummaryResponse } from '../types/models/portfolio';

interface CachedPortfolioData {
  data: IPortfolio[];
  timestamp: string;
}

interface CachedPortfolioSummary {
  data: PortfolioSummaryResponse;
  timestamp: string;
}

export class PortfolioCacheRepository {
  private readonly CACHE_TTL = 300; // 5 minutes
  private cacheService: CacheService;

  constructor() {
    this.cacheService = new CacheService({
      tableName: process.env.DYNAMODB_TABLE || 'fuse-portfolio-cache-local',
      region: process.env.DYNAMODB_REGION || 'local',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    });
  }

  private generateUserPortfolioKey(userId: string): string {
    return `portfolio:user:${userId}`;
  }

  private generatePortfolioSummaryKey(userId: string): string {
    return `portfolio:summary:${userId}`;
  }

  async getPortfolios(userId: string): Promise<IPortfolio[] | null> {
    try {
      const cacheKey = this.generateUserPortfolioKey(userId);
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio for user: ${userId}`);
      const cachedData = await this.cacheService.get<CachedPortfolioData>(cacheKey);

      if (cachedData?.data && Array.isArray(cachedData.data) && cachedData.data.length > 0) {
        console.log(`[PORTFOLIO CACHE HIT] Found valid cache for user: ${userId}`);
        return cachedData.data;
      }

      console.log(`[PORTFOLIO CACHE MISS] No valid cache for user: ${userId}`);
      return null;
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error retrieving cache for user ${userId}:`, error);
      return null;
    }
  }

  async getPortfolioSummary(userId: string): Promise<CachedPortfolioSummary | null> {
    try {
      const cacheKey = this.generatePortfolioSummaryKey(userId);
      console.log(`[PORTFOLIO CACHE] Attempting to retrieve portfolio summary for user: ${userId}`);
      const cachedData = await this.cacheService.get<CachedPortfolioSummary>(cacheKey);

      if (cachedData?.data) {
        console.log(`[PORTFOLIO CACHE HIT] Found valid summary cache for user: ${userId}`);
        return cachedData;
      }

      console.log(`[PORTFOLIO CACHE MISS] No valid summary cache for user: ${userId}`);
      return null;
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error retrieving summary cache for user ${userId}:`, error);
      return null;
    }
  }

  async cachePortfolios(userId: string, portfolios: IPortfolio[]): Promise<void> {
    try {
      const cacheKey = this.generateUserPortfolioKey(userId);
      const data: CachedPortfolioData = {
        data: portfolios,
        timestamp: new Date().toISOString(),
      };

      await this.cacheService.set(cacheKey, data, this.CACHE_TTL);
      console.log(`[PORTFOLIO CACHE] Cached portfolios for user: ${userId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error caching portfolios for user ${userId}:`, error);
    }
  }

  async cachePortfolioSummary(userId: string, summary: PortfolioSummaryResponse): Promise<void> {
    try {
      const cacheKey = this.generatePortfolioSummaryKey(userId);
      const data: CachedPortfolioSummary = {
        data: summary,
        timestamp: new Date().toISOString(),
      };

      await this.cacheService.set(cacheKey, data, this.CACHE_TTL);
      console.log(`[PORTFOLIO CACHE] Cached portfolio summary for user: ${userId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error caching portfolio summary for user ${userId}:`, error);
    }
  }

  async invalidateCache(userId: string): Promise<void> {
    try {
      const portfolioKey = this.generateUserPortfolioKey(userId);
      const summaryKey = this.generatePortfolioSummaryKey(userId);

      await Promise.all([
        this.cacheService.delete(portfolioKey),
        this.cacheService.delete(summaryKey),
      ]);

      console.log(`[PORTFOLIO CACHE] Invalidated all caches for user: ${userId}`);
    } catch (error) {
      console.error(`[PORTFOLIO CACHE ERROR] Error invalidating cache for user ${userId}:`, error);
    }
  }
} 