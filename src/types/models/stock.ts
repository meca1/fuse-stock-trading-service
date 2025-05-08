import { CacheService } from '../../services/cache-service';

/**
 * Stock data from the vendor API
 */
export interface VendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange: string;
}

/**
 * Enhanced stock data with pagination information
 */
export interface EnhancedVendorStock extends VendorStock {
  timestamp: string | undefined;
  pageToken?: string;
  percentageChange?: number;
  volume?: number;
}

/**
 * Stock data for listing
 */
export interface ListedStock {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  lastUpdated: string | undefined;
  market: string;
  percentageChange?: number;
  volume?: number;
}

/**
 * Result of listing stocks
 */
export interface ListStocksResult {
  stocks: ListedStock[];
  nextToken?: string;
  totalItems?: number;
  lastUpdated?: string;
}

/**
 * Cache for storing stock results
 */
export interface StockCache {
  [symbol: string]: {
    data: VendorStock;
    timestamp: number;
  };
}

/**
 * Configuration for stock service
 */
export const STOCK_CONFIG = {
  CACHE_TTL: 120 * 1000, // 2 minutes
  MAX_PAGES: 10,
  PRICE_VARIATION_THRESHOLD: 0.02, // 2%
} as const;

/**
 * Validates if a stock cache entry has expired based on its timestamp
 * @param timestamp The timestamp when the cache entry was created
 * @returns boolean indicating if the cache entry has expired
 */
export function isStockCacheExpired(timestamp: number): boolean {
  const now = Date.now();
  return now - timestamp >= STOCK_CONFIG.CACHE_TTL;
}

/**
 * Interface for parameters used in getStocksWithCache method
 */
export interface GetStocksWithCacheParams {
  nextToken?: string;
  search?: string;
  cacheService: CacheService;
  cacheTTL: number;
}

/**
 * Interface for result returned by getStocksWithCache method
 */
export interface GetStocksWithCacheResult {
  data: ListStocksResult;
  cached: boolean;
}
