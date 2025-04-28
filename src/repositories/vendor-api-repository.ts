import axios, { AxiosInstance } from 'axios';
import { ListStocksResponse, BuyStockParams, BuyStockResponse } from '../types/vendor/stock-api';

export class VendorApiRepository {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.VENDOR_API_URL || 'https://api.challenge.fusefinance.com',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e',
      },
      timeout: 10000,
    });
  }

  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    const config: any = {};
    if (nextToken) {
      config.params = { nextToken };
    }
    const response = await this.client.get('/stocks', config);
    return response.data;
  }

  async getStockPrice(symbol: string, nextToken?: string): Promise<number> {
    const response = await this.listStocks(nextToken);
    const stock = response.data.items.find((item: any) => item.symbol === symbol);
    if (!stock) throw new Error('Stock not found');
    return stock.price;
  }

  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    const response = await this.client.post(`/stocks/${symbol}/buy`, params);
    return response.data;
  }

  // Aquí puedes agregar otros métodos como getStockPrice, etc.
} 