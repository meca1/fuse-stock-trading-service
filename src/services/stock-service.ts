import { VendorApiClient } from './vendor/api-client';
import { StockTokenRepository } from '../repositories/stock-token-repository';
import { StockCacheRepository } from '../repositories/stock-cache-repository';
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
    private stockCacheRepo: StockCacheRepository,
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
    const stockCacheRepo = await StockCacheRepository.initialize();
    const vendorApiRepository = new VendorApiRepository({}, null as any); // Temporal fix for circular dependency
    const vendorApi = new VendorApiClient(vendorApiRepository);
    const stockService = new StockService(stockTokenRepo, stockCacheRepo, vendorApi);
    
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
      console.log(`[BUY STOCK] Attempting to buy ${symbol} with price ${price} and quantity ${quantity}`);
      
      // 1. Try to get stock from cache first
      console.log(`[STOCK CACHE] Checking stock cache for ${symbol}`);
      const cachedStocks = await this.stockCacheRepo.getCachedStocks('all');
      let stock: VendorStock | null = null;

      if (cachedStocks) {
        const cachedStock = cachedStocks.stocks.find(s => s.symbol === symbol);
        if (cachedStock) {
          console.log(`[STOCK CACHE HIT] Found ${symbol} in stock cache`);
          stock = {
            symbol: cachedStock.symbol,
            name: cachedStock.name,
            price: cachedStock.price,
            exchange: cachedStock.market || 'NYSE',
          };
        }
      }

      // 2. If not in cache, get from API
      if (!stock) {
        console.log(`[STOCK CACHE MISS] ${symbol} not found in cache, fetching from API`);
        stock = await this.getStockBySymbol(symbol);
      }

      if (!stock) {
        throw new StockNotFoundError(symbol);
      }

      if (!this.isValidPrice(stock.price, price)) {
        throw new InvalidPriceError(stock.price, price, STOCK_CONFIG.PRICE_VARIATION_THRESHOLD);
      }

      console.log(`[BUY STOCK] Making purchase request for ${symbol}`);
      const result = await this.vendorApi.buyStock(symbol, { price, quantity });
      
      // 3. Update cache with latest price
      if (cachedStocks) {
        const updatedStocks = cachedStocks.stocks.map(s => 
          s.symbol === symbol 
            ? { ...s, price: stock!.price, lastUpdated: new Date().toISOString() }
            : s
        );
        await this.stockCacheRepo.cacheStocks('all', {
          stocks: updatedStocks,
          totalItems: updatedStocks.length,
        }, STOCK_CONFIG.CACHE_TTL);
      }

      return result;
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
      // 1. Check in-memory cache first (fastest)
      const now = Date.now();
      const cachedStock = this.stockCache[symbol];
      if (cachedStock && now - cachedStock.timestamp < STOCK_CONFIG.CACHE_TTL) {
        console.log(`[IN-MEMORY CACHE HIT] Found ${symbol} in memory cache`);
        return cachedStock.data;
      }

      // 2. Check stock cache (fuse-stock-cache-local)
      console.log(`[STOCK CACHE] Checking stock cache for ${symbol}`);
      const cachedStocks = await this.stockCacheRepo.getCachedStocks('all');
      if (cachedStocks) {
        const stock = cachedStocks.stocks.find(s => s.symbol === symbol);
        if (stock) {
          console.log(`[STOCK CACHE HIT] Found ${symbol} in stock cache`);
          const vendorStock = {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            exchange: stock.market || 'NYSE',
          };
          // Update in-memory cache
          this.stockCache[symbol] = {
            data: vendorStock,
            timestamp: now,
          };
          return vendorStock;
        }
      }

      // 3. Check token cache (fuse-stock-tokens-local)
      console.log(`[TOKEN CACHE] Checking token cache for ${symbol}`);
      const token = await this.stockTokenRepo.getToken(symbol);
      if (token) {
        try {
          console.log(`[TOKEN CACHE HIT] Found token for ${symbol}, using it to fetch stock`);
          const response = await this.vendorApi.listStocks(token);
          const stock = response.data.items.find(item => item.symbol === symbol);

          if (stock) {
            const vendorStock = {
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              exchange: stock.exchange || 'NYSE',
            };

            // Update both caches
            this.stockCache[symbol] = {
              data: vendorStock,
              timestamp: now,
            };

            // Update stock cache with the new data
            await this.stockCacheRepo.cacheStocks('all', {
              stocks: [{
                symbol: stock.symbol,
                name: stock.name,
                price: stock.price,
                currency: 'USD',
                market: stock.exchange || 'NYSE',
                lastUpdated: new Date().toISOString(),
              }],
              totalItems: 1,
            }, STOCK_CONFIG.CACHE_TTL);

            return vendorStock;
          }
        } catch (error) {
          console.log(`[TOKEN CACHE] Error using token for ${symbol}, falling back to pagination`);
        }
      }

      // 4. If no cache hits, search through pages
      console.log(`[CACHE MISS] ${symbol} not found in any cache, searching through pages`);
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

          // Update all caches
          this.stockCache[symbol] = {
            data: vendorStock,
            timestamp: now,
          };

          // Update stock cache
          await this.stockCacheRepo.cacheStocks('all', {
            stocks: [{
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              currency: 'USD',
              market: stock.exchange || 'NYSE',
              lastUpdated: new Date().toISOString(),
            }],
            totalItems: 1,
          }, STOCK_CONFIG.CACHE_TTL);

          // Update token cache
          await this.stockTokenRepo.saveToken(symbol, currentToken || '');

          return vendorStock;
        }

        currentToken = response.data.nextToken;
        pageCount++;
      } while (currentToken && pageCount < STOCK_CONFIG.MAX_PAGES);

      console.log(`[STOCK API] Stock ${symbol} not found after searching ${pageCount} pages`);
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
      const cachedData = await this.stockCacheRepo.getCachedStocks(baseKey, nextToken);

      if (cachedData && Array.isArray(cachedData.stocks) && cachedData.stocks.length > 0) {
        console.log(`[CACHE HIT] Found data for key: ${cacheKey}`);
        return {
          data: cachedData,
          cached: true,
        };
      }

      console.log(`[CACHE MISS] No data found for key: ${cacheKey}`);

      // If not in cache, get from API
      const result = await this.listAllStocks(nextToken, search);

      // Save to cache
      try {
        console.log(`[CACHE] Saving data for key: ${cacheKey}`);
        await this.stockCacheRepo.cacheStocks(baseKey, result, STOCK_CONFIG.CACHE_TTL, nextToken);
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
