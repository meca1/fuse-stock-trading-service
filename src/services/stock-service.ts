import { VendorApiClient } from './vendor/api-client';
import { VendorStock, ListStocksResponse } from '../types/vendor';
import { IStock } from '../models/interfaces';
import { VendorService } from './vendor-service';
import { StockTokenService } from './stock-token-service';

interface EnhancedVendorStock extends VendorStock {
  current_price?: number;
  last_updated?: string;
  market?: string;
  percentageChange?: number;
  volume?: number;
}

/**
 * Service to handle stock-related operations
 */
export class StockService {
  private static instance: StockService;
  private vendorApi: VendorApiClient;
  private cacheExpirationMs: number;
  private vendorService: VendorService;
  private tokenService: StockTokenService;

  private constructor() {
    this.vendorApi = new VendorApiClient();
    // 5-minute cache (300,000 ms) since prices change every 5 minutes
    this.cacheExpirationMs = 300000;
    this.vendorService = VendorService.getInstance();
    this.tokenService = StockTokenService.getInstance();
  }

  public static getInstance(): StockService {
    if (!StockService.instance) {
      StockService.instance = new StockService();
    }
    return StockService.instance;
  }

  /**
   * Gets all available stocks, combining data from the vendor and local database
   * @param nextToken Optional token for pagination
   * @param search Optional search string for symbol or name
   * @returns Object containing list of stocks and nextToken for pagination
   */
  async listAllStocks(nextToken?: string, search?: string): Promise<{ stocks: any[], nextToken?: string, totalItems?: number, lastUpdated?: string }> {
    try {
      const { stocks: vendorStocks, nextToken: newNextToken } = await this.fetchAllVendorStocks(1, nextToken);
      let filteredStocks = vendorStocks;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredStocks = vendorStocks.filter(s =>
          s.symbol.toLowerCase().includes(searchLower) ||
          (s.name && s.name.toLowerCase().includes(searchLower))
        );
      }
      
      const stocks = filteredStocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        currency: 'USD',
        lastUpdated: stock.timestamp,
        market: stock.exchange || 'NYSE',
        percentageChange: (stock as EnhancedVendorStock).percentageChange,
        volume: (stock as EnhancedVendorStock).volume,
      }));

      return {
        stocks,
        nextToken: newNextToken,
        totalItems: vendorStocks.length,
        lastUpdated: stocks.length > 0 ? stocks[0].lastUpdated : undefined
      };
    } catch (error) {
      console.error('Error getting stock list:', error);
      throw error;
    }
  }

  /**
   * Gets a specific stock by its symbol
   * @param symbol Stock symbol
   * @returns Stock or null if it doesn't exist
   */
  public async getStockBySymbol(symbol: string): Promise<VendorStock | null> {
    try {
      // Primero intentamos con el token específico del stock
      const token = await this.tokenService.getStockToken(symbol);
      console.log(`Token found for ${symbol}:`, token);
      
      // Si hay token, buscamos en esa página específica
      if (token) {
        console.log(`Getting page with token for ${symbol}`);
        const response = await this.vendorApi.listStocks(token);
        console.log(`Response for ${symbol}:`, JSON.stringify(response.data));
        
        const stock = response.data.items.find(item => item.symbol === symbol);
        if (stock) {
          return {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            exchange: stock.exchange || 'NYSE'
          };
        }
      }

      // Si no hay token o no encontramos el stock en la página del token,
      // buscamos en la primera página
      console.log(`Searching ${symbol} in first page`);
      const response = await this.vendorApi.listStocks();
      const stock = response.data.items.find(item => item.symbol === symbol);
      
      if (!stock) {
        console.warn(`Stock not found: ${symbol}`);
        return null;
      }

      return {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        exchange: stock.exchange || 'NYSE'
      };
    } catch (error) {
      console.error(`Error getting stock ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Verifies if a price is within the acceptable range (±2%)
   * @param currentPrice Current stock price
   * @param offeredPrice Offered price for purchase
   * @returns true if the price is valid, false otherwise
   */
  isValidPrice(currentPrice: number, offeredPrice: number): boolean {
    const lowerLimit = currentPrice * 0.98; // -2%
    const upperLimit = currentPrice * 1.02; // +2%
    
    return offeredPrice >= lowerLimit && offeredPrice <= upperLimit;
  }

  /**
   * Fetches stocks from the vendor API
   * @param maxPages Maximum number of pages to fetch (default: 1)
   * @param startToken Optional token to start pagination from
   * @returns Object containing list of vendor stocks and nextToken for pagination
   */
  private async fetchAllVendorStocks(maxPages: number = 1, startToken?: string): Promise<{ stocks: VendorStock[], nextToken?: string }> {
    try {
      let allStocks: VendorStock[] = [];
      let nextToken: string | undefined = startToken;
      let pageCount = 0;
      do {
        const response: ListStocksResponse = await this.vendorApi.listStocks(nextToken);
        const stocksWithPagination = response.data.items.map(stock => ({
          ...stock,
          pageToken: response.data.nextToken || undefined,
          exchange: stock.exchange || 'NYSE'
        }));
        allStocks = [...allStocks, ...stocksWithPagination];
        nextToken = response.data.nextToken;
        pageCount++;
        if (pageCount >= maxPages) {
          break;
        }
      } while (nextToken);
      return {
        stocks: allStocks,
        nextToken
      };
    } catch (error) {
      console.error('Error fetching vendor stocks:', error);
      throw error;
    }
  }

  /**
   * Checks if a stock's cache is expired
   * @param lastUpdated Last update date
   * @returns true if the cache is expired, false otherwise
   */
  private isCacheExpired(lastUpdated: Date | undefined | null): boolean {
    if (!lastUpdated) return true;
    
    const now = new Date().getTime();
    const lastUpdatedTime = new Date(lastUpdated).getTime();
    
    return (now - lastUpdatedTime) > this.cacheExpirationMs;
  }

  public async getCurrentPrice(symbol: string): Promise<{ price: number }> {
    try {
      const token = await this.tokenService.getStockToken(symbol);
      console.log(`Token found for ${symbol}:`, token);
      
      if (!token) {
        throw new Error(`No token found for symbol: ${symbol}`);
      }

      console.log(`Getting page with token for ${symbol}`);
      const response = await this.vendorApi.listStocks(token);
      console.log(`Response for ${symbol}:`, JSON.stringify(response.data));
      
      const stock = response.data.items.find(item => item.symbol === symbol);
      console.log(`Stock found for ${symbol}:`, stock);
      
      if (!stock) {
        throw new Error(`Stock not found in page: ${symbol}`);
      }

      return {
        price: stock.price
      };
    } catch (error) {
      console.error(`Error getting current price for ${symbol}:`, error);
      throw error;
    }
  }
}
