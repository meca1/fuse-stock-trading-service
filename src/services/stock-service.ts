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
   * @returns List of stocks
   */
  async listAllStocks(): Promise<IStock[]> {
    try {
      // Get all stocks from the vendor
      const vendorStocks = await this.fetchAllVendorStocks();
      
      // Update local database with the most recent information
      await this.updateLocalStocks(vendorStocks);
      
      // Get updated stocks from the database
      const stocks = await this.stockRepository.findAll();
      
      return stocks;
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
      
      // If it doesn't exist or is outdated, get it from the vendor
      if (!stock || this.isCacheExpired(stock.last_updated)) {
        const vendorStocks = await this.fetchAllVendorStocks();
        const vendorStock = vendorStocks.find(s => s.symbol === symbol);
        
        if (vendorStock) {
          // Update or create the stock in the database
          stock = await this.updateOrCreateStock(vendorStock);
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
   * Fetches all stocks from the vendor API
   * @returns List of vendor stocks
   */
  private async fetchAllVendorStocks(): Promise<VendorStock[]> {
    try {
      const stocks = await this.stockRepository.findAll();
      const lastUpdate = stocks.length > 0 ? 
        Math.max(...stocks.map(s => s.last_updated ? new Date(s.last_updated).getTime() : 0)) : 
        null;
      
      if (!lastUpdate || (Date.now() - lastUpdate > this.cacheExpirationMs)) {
        console.log('Cache expired or not initialized, fetching fresh data from vendor');
        const response: ListStocksResponse = await this.vendorApi.listStocks();
        return response.data.items;
      }
      
      console.log('Using cached stock data');
      // Convert database stocks to vendor format
      return stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.current_price,
        exchange: 'NYSE', // Default exchange since IStock doesn't have this property
        industry: undefined, // Optional field
        timestamp: stock.last_updated ? new Date(stock.last_updated).toISOString() : new Date().toISOString()
      }));
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
