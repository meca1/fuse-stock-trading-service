import { VendorApiClient } from './vendor/api-client';
import { Stock } from '../models/Stock';
import { VendorStock } from '../types/vendor';
import { Op } from 'sequelize';

/**
 * Service to handle stock-related operations
 */
export class StockService {
  private vendorApi: VendorApiClient;
  private cacheExpirationMs: number;

  constructor() {
    this.vendorApi = new VendorApiClient();
    // 5-minute cache (300,000 ms) since prices change every 5 minutes
    this.cacheExpirationMs = 300000;
  }

  /**
   * Gets all available stocks, combining data from the vendor and local database
   * @returns List of stocks
   */
  async listAllStocks(): Promise<Stock[]> {
    try {
      // Get all stocks from the vendor
      const vendorStocks = await this.fetchAllVendorStocks();
      
      // Update local database with the most recent information
      await this.updateLocalStocks(vendorStocks);
      
      // Get updated stocks from the database
      const stocks = await Stock.findAll();
      
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
  async getStockBySymbol(symbol: string): Promise<Stock | null> {
    try {
      // Search for the stock in the database
      let stock = await Stock.findByPk(symbol);
      
      // If it doesn't exist or is outdated, get it from the vendor
      if (!stock || this.isCacheExpired(stock.lastUpdated)) {
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
   * Gets all stocks from the vendor, handling pagination
   * @returns Complete list of vendor stocks
   */
  private async fetchAllVendorStocks(): Promise<VendorStock[]> {
    let allStocks: VendorStock[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await this.vendorApi.listStocks(nextToken);
      allStocks = [...allStocks, ...response.data.items];
      nextToken = response.data.nextToken;
    } while (nextToken);
    
    return allStocks;
  }

  /**
   * Updates the local database with stock information from the vendor
   * @param vendorStocks List of vendor stocks
   */
  private async updateLocalStocks(vendorStocks: VendorStock[]): Promise<void> {
    // Get all symbols from vendor stocks
    const symbols = vendorStocks.map(stock => stock.symbol);
    
    // Search for existing stocks in the database
    const existingStocks = await Stock.findAll({
      where: {
        symbol: {
          [Op.in]: symbols
        }
      }
    });
    
    // Create a map of existing stocks for quick access
    const existingStocksMap = new Map<string, Stock>();
    existingStocks.forEach(stock => {
      existingStocksMap.set(stock.symbol, stock);
    });
    
    // Update or create stocks in the database
    for (const vendorStock of vendorStocks) {
      await this.updateOrCreateStock(vendorStock, existingStocksMap.get(vendorStock.symbol));
    }
  }

  /**
   * Updates or creates a stock in the database
   * @param vendorStock Vendor stock
   * @param existingStock Existing stock in the database (optional)
   * @returns Updated or created stock
   */
  private async updateOrCreateStock(vendorStock: VendorStock, existingStock?: Stock): Promise<Stock> {
    const now = new Date();
    
    if (existingStock) {
      // Update existing stock
      existingStock.name = vendorStock.name;
      existingStock.currentPrice = vendorStock.price;
      existingStock.lastUpdated = now;
      existingStock.description = vendorStock.industry || '';
      
      await existingStock.save();
      return existingStock;
    } else {
      // Create new stock
      return await Stock.create({
        symbol: vendorStock.symbol,
        name: vendorStock.name,
        currentPrice: vendorStock.price,
        lastUpdated: now,
        description: vendorStock.industry || '',
      });
    }
  }

  /**
   * Checks if a stock's cache is expired
   * @param lastUpdated Last update date
   * @returns true if the cache is expired, false otherwise
   */
  private isCacheExpired(lastUpdated: Date): boolean {
    const now = new Date().getTime();
    const lastUpdatedTime = lastUpdated.getTime();
    
    return (now - lastUpdatedTime) > this.cacheExpirationMs;
  }
}
