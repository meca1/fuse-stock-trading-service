import { ListStocksResponse } from '../vendor/stock-api';

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
  }
}

/**
 * Configuration for stock service
 */
export const STOCK_CONFIG = {
  CACHE_TTL: 300 * 1000, // 5 minutes in milliseconds
  MAX_PAGES: 10,
  PRICE_VARIATION_THRESHOLD: 0.02 // 2%
} as const; 