import { VendorApiClient } from './vendor/api-client';
import { VendorStock, ListStocksResponse } from '../types/vendor';
import { StockRepository } from '../repositories/stock-repository';
import { IStock } from '../models/interfaces';
import { VendorService } from './vendor-service';
import { StockTokenService } from './stock-token-service';

/**
 * Service to handle stock-related operations
 */
export class StockService {
  private static instance: StockService;
  private vendorApi: VendorApiClient;
  private cacheExpirationMs: number;
  private stockRepository: StockRepository;
  private vendorService: VendorService;
  private tokenService: StockTokenService;

  private constructor() {
    this.vendorApi = new VendorApiClient();
    // 5-minute cache (300,000 ms) since prices change every 5 minutes
    this.cacheExpirationMs = 300000;
    this.stockRepository = new StockRepository();
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
   * @returns Object containing list of stocks and nextToken for pagination
   */
  async listAllStocks(nextToken?: string): Promise<{ stocks: IStock[], nextToken?: string }> {
    try {
      // Get stocks from the vendor with pagination
      const { stocks: vendorStocks, nextToken: newNextToken } = await this.fetchAllVendorStocks(1, nextToken);
      
      // Update local database with the most recent information
      await this.updateLocalStocks(vendorStocks);
      
      // Get updated stocks from the database
      const stocks = await this.stockRepository.findAll();
      
      return {
        stocks,
        nextToken: newNextToken
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
      // Obtener el token para el símbolo desde DynamoDB
      const token = await this.tokenService.getStockToken(symbol);
      console.log(`Token found for ${symbol}:`, token);
      
      if (!token) {
        console.warn(`No token found for symbol: ${symbol}`);
        return null;
      }

      // Obtener la página usando el token
      console.log(`Getting page with token for ${symbol}`);
      const response = await this.vendorApi.listStocks(token);
      console.log(`Response for ${symbol}:`, JSON.stringify(response.data));
      
      // Buscar el stock en la página
      const stock = response.data.items.find(item => item.symbol === symbol);
      console.log(`Stock found for ${symbol}:`, stock);
      
      if (!stock) {
        console.warn(`Stock not found in page: ${symbol}`);
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
      const stocks = await this.stockRepository.findAll();
      const lastUpdate = stocks.length > 0 ? 
        Math.max(...stocks.map(s => s.last_updated ? new Date(s.last_updated).getTime() : 0)) : 
        null;
      
      // Forzamos la actualización para asegurarnos de que se guarden los tokens de paginación
      const forceRefresh = true; // Siempre actualizamos para guardar los tokens de paginación
      if (forceRefresh || !lastUpdate || (Date.now() - lastUpdate > this.cacheExpirationMs)) {
        console.log('Cache expired or not initialized, fetching fresh data from vendor');
        
        // Implement pagination using nextToken with a limit on pages
        let allStocks: VendorStock[] = [];
        let nextToken: string | undefined;
        let pageCount = 0;
        
        do {
          // Get a page of stocks from the vendor API
          const response: ListStocksResponse = await this.vendorApi.listStocks(nextToken);
          const currentPageToken = nextToken; // Guardamos el token actual antes de cambiarlo
          
          // Obtenemos el token para la siguiente página
          const nextPageToken = response.data.nextToken;
          
          // Añadimos los stocks de esta página a nuestra colección
          const stocksWithPagination = response.data.items.map(stock => ({
            ...stock,
            pageToken: nextPageToken || undefined,
            exchange: stock.exchange || 'NYSE'
          }));
          
          allStocks = [...allStocks, ...stocksWithPagination];
          
          // Get the nextToken for the next page
          nextToken = response.data.nextToken;
          pageCount++;
          
          // Stop if we've reached the maximum number of pages
          if (pageCount >= maxPages) {
            break;
          }
        } while (nextToken); // Continue until there are no more pages or we reach the limit
        
        console.log(`Total stocks fetched from vendor: ${allStocks.length}`);
        return {
          stocks: allStocks,
          nextToken
        };
      }
      
      console.log('Using cached stock data');
      // Convert database stocks to vendor format
      return {
        stocks: stocks.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.current_price,
          exchange: 'NYSE', // Default exchange since IStock doesn't have this property
          industry: undefined, // Optional field
          timestamp: stock.last_updated ? new Date(stock.last_updated).toISOString() : new Date().toISOString()
        })),
        nextToken: undefined
      };
    } catch (error) {
      console.error('Error fetching vendor stocks:', error);
      throw error;
    }
  }

  /**
   * Updates the local database with the latest stock information from the vendor
   * @param vendorStocks List of vendor stocks
   */
  private async updateLocalStocks(vendorStocks: VendorStock[]): Promise<void> {
    if (vendorStocks.length === 0) {
      return;
    }
    
    try {
      const stocks = vendorStocks.map(vendorStock => ({
        symbol: vendorStock.symbol,
        name: vendorStock.name,
        current_price: vendorStock.price,
        page_token: vendorStock.pageToken,
        last_updated: new Date()
      }));
      
      await this.stockRepository.upsertMany(stocks);
      
      console.log(`Updated ${vendorStocks.length} stocks in the database with pagination information`);
    } catch (error) {
      console.error('Error updating local stocks:', error);
      throw error;
    }
  }

  /**
   * Updates or creates a stock in the database
   * @param vendorStock Vendor stock
   * @returns Updated or created stock
   */
  private async updateOrCreateStock(vendorStock: VendorStock): Promise<IStock> {
    const stock = {
      symbol: vendorStock.symbol,
      name: vendorStock.name,
      current_price: vendorStock.price,
      last_updated: new Date()
    };
    
    return await this.stockRepository.upsert(stock);
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
      // Obtener el token para el símbolo desde DynamoDB
      const token = await this.tokenService.getStockToken(symbol);
      console.log(`Token found for ${symbol}:`, token);
      
      if (!token) {
        throw new Error(`No token found for symbol: ${symbol}`);
      }

      // Obtener la página usando el token
      console.log(`Getting page with token for ${symbol}`);
      const response = await this.vendorApi.listStocks(token);
      console.log(`Response for ${symbol}:`, JSON.stringify(response.data));
      
      // Buscar el stock en la página
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

  /**
   * Updates a stock's price in the database
   * @param symbol Stock symbol
   * @param price New price
   */
  async updateStockPrice(symbol: string, price: number): Promise<void> {
    try {
      const stock = await this.stockRepository.findBySymbol(symbol);
      if (!stock) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }

      // Get the current page token from the vendor
      const response = await this.vendorService.getStocks(stock.page_token || undefined);
      
      await this.stockRepository.upsert({
        symbol,
        name: stock.name,
        current_price: price,
        page_token: response.data.nextToken || stock.page_token || '', // Use new token if available, otherwise keep existing
        last_updated: new Date()
      });
    } catch (error) {
      console.error(`Error updating stock price for ${symbol}:`, error);
      throw error;
    }
  }
}
