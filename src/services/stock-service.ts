import { VendorApiClient } from './vendor/api-client';
import { VendorStock, ListStocksResponse, EnhancedVendorStock } from '../types/models/stock';
import { StockTokenRepository } from '../repositories/stock-token-repository';

// Configuración
const CONFIG = {
  CACHE_TTL: 300 * 1000, // 5 minutes in milliseconds
  MAX_PAGES: 10,
  PRICE_VARIATION_THRESHOLD: 0.02 // 2%
} as const;

// Errores específicos
export class StockNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Stock with symbol ${symbol} not found`);
    this.name = 'StockNotFoundError';
  }
}

export class InvalidPriceError extends Error {
  constructor(currentPrice: number, requestedPrice: number) {
    super(`Price must be within ${CONFIG.PRICE_VARIATION_THRESHOLD * 100}% of current price ($${currentPrice})`);
    this.name = 'InvalidPriceError';
  }
}

// Interfaces
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

export interface ListStocksResult {
  stocks: ListedStock[];
  nextToken?: string;
  totalItems?: number;
  lastUpdated?: string;
}

// Cache para almacenar resultados de stocks
interface StockCache {
  [symbol: string]: {
    data: VendorStock;
    timestamp: number;
  }
}

/**
 * Service to handle stock-related operations and token management
 */
export class StockService {
  private stockCache: StockCache = {};
  private requestsInProgress: Record<string, Promise<VendorStock | null>> = {};

  constructor(
    private stockTokenRepository: StockTokenRepository,
    private vendorApi: VendorApiClient
  ) {}

  /**
   * Gets the stock token repository instance
   * @returns The stock token repository instance
   */
  public getStockTokenRepository(): StockTokenRepository {
    return this.stockTokenRepository;
  }

  /**
   * Gets the vendor API client instance
   * @returns The vendor API client instance
   */
  public getVendorApi(): VendorApiClient {
    return this.vendorApi;
  }

  /**
   * Executes a stock purchase through the vendor API
   * @param symbol Stock symbol
   * @param price Price to buy at
   * @param quantity Quantity to buy
   * @returns Response from the vendor API
   * @throws {StockNotFoundError} When the stock is not found
   * @throws {InvalidPriceError} When the price is not within the allowed range
   */
  public async buyStock(symbol: string, price: number, quantity: number): Promise<any> {
    try {
      const stock = await this.getStockBySymbol(symbol);
      if (!stock) {
        throw new StockNotFoundError(symbol);
      }
      
      if (!this.isValidPrice(stock.price, price)) {
        throw new InvalidPriceError(stock.price, price);
      }
      
      return await this.vendorApi.buyStock(symbol, { price, quantity });
    } catch (error) {
      if (error instanceof StockNotFoundError || error instanceof InvalidPriceError) {
        throw error;
      }
      throw new Error(`Error buying stock ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets all available stocks, combining data from the vendor and local database
   * @param nextToken Optional token for pagination
   * @param search Optional search string for symbol or name
   * @returns Object containing list of stocks and pagination information
   */
  async listAllStocks(nextToken?: string, search?: string): Promise<ListStocksResult> {
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
      
      const stocks: ListedStock[] = filteredStocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        currency: 'USD',
        lastUpdated: stock.timestamp,
        market: stock.exchange || 'NYSE',
        percentageChange: stock.percentageChange,
        volume: stock.volume,
      }));

      return {
        stocks,
        nextToken: newNextToken,
        totalItems: vendorStocks.length,
        lastUpdated: stocks.length > 0 ? stocks[0].lastUpdated : undefined
      };
    } catch (error) {
      throw new Error(`Error getting stock list: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verifica si el precio está dentro del rango permitido del precio actual
   * @param currentPrice Precio actual de la acción
   * @param requestedPrice Precio solicitado
   * @returns true si el precio está dentro del rango permitido
   */
  public isValidPrice(currentPrice: number, requestedPrice: number): boolean {
    const priceDiff = Number((Math.abs(requestedPrice - currentPrice)).toFixed(10));
    const maxDiff = Number((currentPrice * CONFIG.PRICE_VARIATION_THRESHOLD).toFixed(10));
    return priceDiff <= maxDiff;
  }

  /**
   * Gets a specific stock by its symbol, using cache when possible
   * @param symbol Stock symbol
   * @returns Stock or null if it doesn't exist
   */
  public async getStockBySymbol(symbol: string): Promise<VendorStock | null> {
    if (symbol in this.requestsInProgress) {
      return this.requestsInProgress[symbol];
    }

    const requestPromise = this.fetchStockBySymbol(symbol);
    this.requestsInProgress[symbol] = requestPromise;

    try {
      return await requestPromise;
    } finally {
      delete this.requestsInProgress[symbol];
    }
  }

  /**
   * Internal implementation of stock search
   * @param symbol Stock symbol to search for
   * @returns Stock data or null if not found
   */
  private async fetchStockBySymbol(symbol: string): Promise<VendorStock | null> {
    try {
      const now = Date.now();
      const cachedStock = this.stockCache[symbol];
      
      if (cachedStock && (now - cachedStock.timestamp) < CONFIG.CACHE_TTL) {
        return cachedStock.data;
      }
      
      const token = await this.stockTokenRepository.getToken(symbol);
      
      if (token) {
        try {
          const response = await this.vendorApi.listStocks(token);
          const stock = response.data.items.find(item => item.symbol === symbol);
          
          if (stock) {
            const vendorStock = {
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              exchange: stock.exchange || 'NYSE'
            };
            
            this.stockCache[symbol] = {
              data: vendorStock,
              timestamp: now
            };
            
            return vendorStock;
          }
        } catch (error) {
          // Continue with pagination search if token search fails
        }
      }

      let currentToken: string | undefined = undefined;
      let pageCount = 0;
      
      do {
        const response = await this.vendorApi.listStocks(currentToken);
        const stock = response.data.items.find(item => item.symbol === symbol);
        
        if (stock) {
          const vendorStock = {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            exchange: stock.exchange || 'NYSE'
          };
          
          await this.stockTokenRepository.saveToken(symbol, currentToken || '');
          
          this.stockCache[symbol] = {
            data: vendorStock,
            timestamp: now
          };
          
          return vendorStock;
        }
        
        currentToken = response.data.nextToken;
        pageCount++;
        
      } while (currentToken && pageCount < CONFIG.MAX_PAGES);
      
      return null;
    } catch (error) {
      throw new Error(`Error getting stock ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the current price of a stock
   * @param symbol Stock symbol
   * @returns Object containing the current price
   * @throws {StockNotFoundError} When the stock is not found
   */
  public async getCurrentPrice(symbol: string): Promise<{ price: number }> {
    try {
      const stock = await this.getStockBySymbol(symbol);
      if (!stock) {
        throw new StockNotFoundError(symbol);
      }
      return { price: stock.price };
    } catch (error) {
      if (error instanceof StockNotFoundError) {
        throw error;
      }
      throw new Error(`Error getting current price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetches stocks from the vendor API
   * @param maxPages Maximum number of pages to fetch (default: 1)
   * @param startToken Optional token to start pagination from
   * @returns Object containing list of vendor stocks and nextToken for pagination
   */
  private async fetchAllVendorStocks(maxPages: number = 1, startToken?: string): Promise<{ stocks: EnhancedVendorStock[], nextToken?: string }> {
    try {
      let allStocks: EnhancedVendorStock[] = [];
      let nextToken: string | undefined = startToken;
      let pageCount = 0;
      do {
        const response: ListStocksResponse = await this.vendorApi.listStocks(nextToken);
        const stocksWithPagination: EnhancedVendorStock[] = response.data.items.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          exchange: stock.exchange || 'NYSE',
          timestamp: stock.timestamp,
          pageToken: response.data.nextToken || undefined
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
}
