import { VendorApiClient } from './vendor/api-client';
import { StockTokenRepository } from '../repositories/stock-token-repository';
import { VendorApiRepository } from '../repositories/vendor-api-repository';
import {
  VendorStock,
  EnhancedVendorStock,
  ListedStock,
  ListStocksResult,
  StockCache,
  STOCK_CONFIG,
} from '../types/models/stock';
import { StockNotFoundError, InvalidPriceError } from '../utils/errors/stock-errors';
import { CacheService } from './cache-service';

/**
 * Service to handle stock-related operations, token management and daily updates
 */
export class StockService {
  private stockCache: StockCache = {};
  private requestsInProgress: Record<string, Promise<VendorStock | null>> = {};
  private isTokenUpdateRunning = false;
  private cacheService: CacheService;

  constructor(
    private stockTokenRepo: StockTokenRepository,
    private vendorApi: VendorApiClient,
  ) {
    this.cacheService = new CacheService({
      tableName: process.env.DYNAMODB_TABLE || 'fuse-stock-cache-local',
      region: process.env.DYNAMODB_REGION || 'local',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    });
  }

  /**
   * Creates and initializes a new instance of StockService with all required dependencies
   * @returns Promise with initialized StockService instance
   */
  public static async initialize(): Promise<StockService> {
    const stockTokenRepo = await StockTokenRepository.initialize();
    const vendorApiRepository = new VendorApiRepository({}, null as any); // Temporal fix for circular dependency
    const vendorApi = new VendorApiClient(vendorApiRepository);
    const stockService = new StockService(stockTokenRepo, vendorApi);
    
    // Set the StockService in the VendorApiRepository after creation
    (vendorApiRepository as any).stockService = stockService;
    
    return stockService;
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
        throw new InvalidPriceError(stock.price, price, STOCK_CONFIG.PRICE_VARIATION_THRESHOLD);
      }

      return await this.vendorApi.buyStock(symbol, { price, quantity });
    } catch (error) {
      if (error instanceof StockNotFoundError || error instanceof InvalidPriceError) {
        throw error;
      }
      throw new Error(
        `Error buying stock ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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
      const { stocks: vendorStocks, nextToken: newNextToken } = await this.fetchAllVendorStocks(
        1,
        nextToken,
      );
      let filteredStocks = vendorStocks;

      if (search) {
        const searchLower = search.toLowerCase();
        filteredStocks = vendorStocks.filter(
          s =>
            s.symbol.toLowerCase().includes(searchLower) ||
            (s.name && s.name.toLowerCase().includes(searchLower)),
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
        lastUpdated: stocks.length > 0 ? stocks[0].lastUpdated : undefined,
      };
    } catch (error) {
      throw new Error(
        `Error getting stock list: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Verifica si el precio está dentro del rango permitido del precio actual
   * @param currentPrice Precio actual de la acción
   * @param requestedPrice Precio solicitado
   * @returns true si el precio está dentro del rango permitido
   */
  public isValidPrice(currentPrice: number, requestedPrice: number): boolean {
    const priceDiff = Number(Math.abs(requestedPrice - currentPrice).toFixed(10));
    const maxDiff = Number((currentPrice * STOCK_CONFIG.PRICE_VARIATION_THRESHOLD).toFixed(10));
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
   * Checks if the table exists before performing operations
   */
  public async checkTableExists(tableName: string): Promise<boolean> {
    try {
      return await this.stockTokenRepo.checkTableExists();
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Updates stock tokens with robust error handling
   */
  public async updateStockTokens(): Promise<void> {
    if (this.isTokenUpdateRunning) {
      return;
    }

    this.isTokenUpdateRunning = true;

    try {
      const tableExists = await this.checkTableExists(process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
      if (!tableExists) {
        throw new Error(`Table ${process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local'} does not exist and could not be created`);
      }

      let currentToken: string | undefined;
      const processedSymbols = new Set<string>();
      const failedSymbols: string[] = [];

      do {
        const response = await this.vendorApi.listStocks(currentToken);
        const stocks = response.data.items;
        const nextToken = response.data.nextToken;

        // Process in larger batches to cover more stocks
        const batchSize = 25;
        for (let i = 0; i < stocks.length; i += batchSize) {
          const batch = stocks.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async stock => {
              if (!processedSymbols.has(stock.symbol)) {
                try {
                  await this.stockTokenRepo.saveToken(stock.symbol, currentToken || '');
                  processedSymbols.add(stock.symbol);
                } catch (error) {
                  failedSymbols.push(stock.symbol);
                }
              }
            }),
          );
        }

        currentToken = nextToken;
      } while (currentToken);

      if (failedSymbols.length > 0) {
        throw new Error(
          `Token update failed for ${failedSymbols.length} stocks: ${failedSymbols.join(', ')}`,
        );
      }
    } catch (error) {
      throw new Error(
        `Error in stock token update: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.isTokenUpdateRunning = false;
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

      if (cachedStock && now - cachedStock.timestamp < STOCK_CONFIG.CACHE_TTL) {
        return cachedStock.data;
      }

      const token = await this.stockTokenRepo.getToken(symbol);

      if (token) {
        try {
          const response = await this.vendorApi.listStocks(token);
          const stock = response.data.items.find(item => item.symbol === symbol);

          if (stock) {
            const vendorStock = {
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              exchange: stock.exchange || 'NYSE',
            };

            this.stockCache[symbol] = {
              data: vendorStock,
              timestamp: now,
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
            exchange: stock.exchange || 'NYSE',
          };

          await this.stockTokenRepo.saveToken(symbol, currentToken || '');

          this.stockCache[symbol] = {
            data: vendorStock,
            timestamp: now,
          };

          return vendorStock;
        }

        currentToken = response.data.nextToken;
        pageCount++;
      } while (currentToken && pageCount < STOCK_CONFIG.MAX_PAGES);

      return null;
    } catch (error) {
      throw new Error(
        `Error getting stock ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Fetches stocks from the vendor API
   * @param maxPages Maximum number of pages to fetch (default: 1)
   * @param startToken Optional token to start pagination from
   * @returns Object containing list of vendor stocks and nextToken for pagination
   */
  private async fetchAllVendorStocks(
    maxPages: number = 1,
    startToken?: string,
  ): Promise<{ stocks: EnhancedVendorStock[]; nextToken?: string }> {
    try {
      let allStocks: EnhancedVendorStock[] = [];
      let nextToken: string | undefined = startToken;
      let pageCount = 0;
      do {
        const response = await this.vendorApi.listStocks(nextToken);
        const stocksWithPagination: EnhancedVendorStock[] = response.data.items.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          exchange: stock.exchange || 'NYSE',
          timestamp: stock.timestamp,
          pageToken: response.data.nextToken || undefined,
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
        nextToken,
      };
    } catch (error) {
      throw new Error(
        `Error fetching vendor stocks: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets stocks with cache handling
   * @param nextToken Optional token for pagination
   * @param search Optional search string for symbol or name
   * @returns Object containing stocks data and cache status
   */
  public async getStocksWithCache(
    nextToken?: string,
    search?: string,
  ): Promise<{ data: ListStocksResult; cached: boolean }> {
    // Generate cache key
    const baseKey = search ? `search:${search}` : 'all';
    const cacheKey = nextToken ? `${baseKey}:page:${nextToken}` : baseKey;

    try {
      // Try to get from cache
      console.log(`Attempting to retrieve from cache: ${cacheKey}`);
      const cachedData = await this.cacheService.get<{ data: ListStocksResult; lastUpdated: string }>(cacheKey);

      if (cachedData?.data && Array.isArray(cachedData.data.stocks) && cachedData.data.stocks.length > 0) {
        console.log(`[CACHE HIT] Found data for key: ${cacheKey}`);
        return {
          data: cachedData.data,
          cached: true,
        };
      }

      console.log(`[CACHE MISS] No data found for key: ${cacheKey}`);

      // If not in cache, get from API
      const result = await this.listAllStocks(nextToken, search);

      // Save to cache
      try {
        console.log(`[CACHE] Saving data for key: ${cacheKey}`);
        await this.cacheService.set(cacheKey, {
          data: result,
          lastUpdated: new Date().toISOString()
        }, STOCK_CONFIG.CACHE_TTL);
        console.log('Cache write successful');
      } catch (err) {
        console.error(`[CACHE ERROR] Error saving data for key ${cacheKey}:`, err);
      }

      return {
        data: result,
        cached: false,
      };
    } catch (err) {
      console.error(`[CACHE ERROR] Error retrieving data for key ${cacheKey}:`, err);
      // If cache fails, get from API
      const result = await this.listAllStocks(nextToken, search);
      return {
        data: result,
        cached: false,
      };
    }
  }
}
