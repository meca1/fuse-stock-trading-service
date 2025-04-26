import axios from 'axios';

const VENDOR_API_BASE_URL = 'https://api.challenge.fusefinance.com';
const API_KEY = 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const REFRESH_THRESHOLD = 4 * 60 * 1000; // 4 minutes in milliseconds
const PRICE_VARIATION_THRESHOLD = 0.02; // 2% price variation allowed

interface StockCache {
  price: number;
  timestamp: number;
  nextToken?: string;
}

interface VendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange: string;
  industry?: string;
  timestamp: string;
}

interface VendorResponse {
  status: number;
  data: {
    items: VendorStock[];
    nextToken?: string;
  };
}

export class VendorService {
  private static instance: VendorService;
  private client;
  private stockCache: Map<string, StockCache>;

  private constructor() {
    this.client = axios.create({
      baseURL: VENDOR_API_BASE_URL,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    });
    this.stockCache = new Map();
  }

  public static getInstance(): VendorService {
    if (!VendorService.instance) {
      VendorService.instance = new VendorService();
    }
    return VendorService.instance;
  }

  private isCacheValid(symbol: string): boolean {
    const cache = this.stockCache.get(symbol);
    if (!cache) return false;

    const now = Date.now();
    const age = now - cache.timestamp;
    return age < CACHE_DURATION;
  }

  private shouldRefreshCache(symbol: string): boolean {
    const cache = this.stockCache.get(symbol);
    if (!cache) return true;

    const now = Date.now();
    const age = now - cache.timestamp;
    return age > REFRESH_THRESHOLD;
  }

  private isPriceWithinRange(currentPrice: number, purchasePrice: number): boolean {
    const priceDifference = Math.abs((purchasePrice - currentPrice) / currentPrice);
    return priceDifference <= PRICE_VARIATION_THRESHOLD;
  }

  async getStocks(pageToken?: string): Promise<VendorResponse> {
    try {
      const params: any = {};
      if (pageToken) {
        params.nextToken = pageToken;
      }

      const response = await this.client.get('/stocks', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching stocks:', error);
      throw error;
    }
  }

  async getStockPrice(symbol: string): Promise<number> {
    try {
      // If cache is valid, return cached price
      if (this.isCacheValid(symbol)) {
        return this.stockCache.get(symbol)!.price;
      }

      // If we should refresh and have a nextToken, use it
      const cache = this.stockCache.get(symbol);
      const params: any = { symbol };
      if (this.shouldRefreshCache(symbol) && cache?.nextToken) {
        params.nextToken = cache.nextToken;
      }

      const response = await this.client.get('/stocks', { params });

      if (response.data.status === 200 && response.data.data.items.length > 0) {
        const stockData = response.data.data.items[0];
        
        // Update cache
        this.stockCache.set(symbol, {
          price: stockData.price,
          timestamp: Date.now(),
          nextToken: response.data.data.nextToken
        });

        return stockData.price;
      }
      throw new Error('Stock not found');
    } catch (error) {
      console.error('Error fetching stock price:', error);
      throw error;
    }
  }

  async buyStock(symbol: string, price: number, quantity: number): Promise<boolean> {
    try {
      // Get current stock price
      const currentPrice = await this.getStockPrice(symbol);

      // Validate price is within allowed range
      if (!this.isPriceWithinRange(currentPrice, price)) {
        throw new Error(`Price must be within 2% of current price ($${currentPrice})`);
      }

      const response = await this.client.post(`/stocks/${symbol}/buy`, {
        price,
        quantity,
      });

      return response.data.status === 200;
    } catch (error: any) {
      console.error('Error buying stock:', error);
      throw error;
    }
  }
} 