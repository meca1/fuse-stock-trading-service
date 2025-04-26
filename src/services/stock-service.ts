import { VendorApiClient } from './vendor/api-client';
import { VendorStock, ListStocksResponse } from '../types/vendor';
import { StockRepository } from '../repositories/stock-repository';
import { IStock } from '../models/interfaces';

/**
 * Service to handle stock-related operations
 */
export class StockService {
  private vendorApi: VendorApiClient;
  private cacheExpirationMs: number;
  private stockRepository: StockRepository;

  constructor() {
    this.vendorApi = new VendorApiClient();
    // 5-minute cache (300,000 ms) since prices change every 5 minutes
    this.cacheExpirationMs = 300000;
    this.stockRepository = new StockRepository();
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
  async getStockBySymbol(symbol: string): Promise<IStock | null> {
    try {
      // Search for the stock in the database
      let stock = await this.stockRepository.findBySymbol(symbol);
      
      // If not found or cache expired, fetch from vendor and update
      if (!stock || !stock.last_updated || (Date.now() - new Date(stock.last_updated).getTime() > this.cacheExpirationMs)) {
        const { stocks: vendorStocks } = await this.fetchAllVendorStocks();
        const vendorStock = vendorStocks.find((s: VendorStock) => s.symbol === symbol);
        
        if (vendorStock) {
          await this.updateLocalStocks([vendorStock]);
          stock = await this.stockRepository.findBySymbol(symbol);
        }
      }
      
      return stock;
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
      
      if (!lastUpdate || (Date.now() - lastUpdate > this.cacheExpirationMs)) {
        console.log('Cache expired or not initialized, fetching fresh data from vendor');
        
        // Implement pagination using nextToken with a limit on pages
        let allStocks: VendorStock[] = [];
        let nextToken: string | undefined = undefined;
        let pageCount = 0;
        
        do {
          // Get a page of stocks from the vendor API
          const response: ListStocksResponse = await this.vendorApi.listStocks(nextToken);
          
          // Add the stocks from this page to our collection
          allStocks = [...allStocks, ...response.data.items];
          
          // Get the nextToken for the next page
          nextToken = response.data.nextToken;
          pageCount++;
          
          console.log(`Fetched ${response.data.items.length} stocks, nextToken: ${nextToken || 'none'}, page ${pageCount}/${maxPages}`);
          
          // Stop if we've reached the maximum number of pages
          if (pageCount >= maxPages) {
            console.log(`Reached maximum number of pages (${maxPages}), stopping pagination`);
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
        last_updated: new Date()
      }));
      
      await this.stockRepository.upsertMany(stocks);
      
      console.log(`Updated ${vendorStocks.length} stocks in the database`);
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
}
