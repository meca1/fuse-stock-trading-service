import axios from 'axios';
import { VendorStockRepository } from '../../repositories/vendor-stock-repository';
import { ListStocksResponse, BuyStockParams, BuyStockResponse, VendorApiError, VendorStock } from '../../types/vendor/stock-api';

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const REFRESH_THRESHOLD = 4 * 60 * 1000; // 4 minutes in milliseconds
const PRICE_VARIATION_THRESHOLD = 0.02; // 2% price variation allowed

interface StockCache {
  price: number;
  timestamp: number;
  nextToken?: string;
}

/**
 * Cliente para interactuar con la API del proveedor de stocks
 */
export class VendorApiClient {
  private static instance: VendorApiClient;
  private vendorStockRepository!: VendorStockRepository;
  private baseUrl: string = process.env.VENDOR_API_URL || 'https://api.challenge.fusefinance.com';
  private apiKey: string = process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e';
  private stockCache: Map<string, StockCache> = new Map();

  constructor(vendorStockRepository?: VendorStockRepository) {
    if (VendorApiClient.instance) {
      return VendorApiClient.instance;
    }
    if (vendorStockRepository) {
      this.vendorStockRepository = vendorStockRepository;
    } else {
      const client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        timeout: 10000,
      });
      this.vendorStockRepository = new VendorStockRepository(client);
    }
    VendorApiClient.instance = this;
  }

  public static getInstance(): VendorApiClient {
    if (!VendorApiClient.instance) {
      VendorApiClient.instance = new VendorApiClient();
    }
    return VendorApiClient.instance;
  }

  /**
   * Verifica si el caché de un stock es válido
   */
  private isCacheValid(symbol: string): boolean {
    const cache = this.stockCache.get(symbol);
    if (!cache) return false;

    const now = Date.now();
    const age = now - cache.timestamp;
    return age < CACHE_DURATION;
  }

  /**
   * Verifica si el caché debe ser refrescado
   */
  private shouldRefreshCache(symbol: string): boolean {
    const cache = this.stockCache.get(symbol);
    if (!cache) return true;

    const now = Date.now();
    const age = now - cache.timestamp;
    return age > REFRESH_THRESHOLD;
  }

  /**
   * Verifica si un precio está dentro del rango permitido
   */
  private isPriceWithinRange(currentPrice: number, purchasePrice: number): boolean {
    const priceDifference = Math.abs((purchasePrice - currentPrice) / currentPrice);
    return priceDifference <= PRICE_VARIATION_THRESHOLD;
  }

  /**
   * Obtiene la lista de stocks disponibles
   * @param nextToken Token para paginación
   * @returns Lista de stocks
   */
  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    try {
      return await this.vendorStockRepository.listStocks(nextToken);
    } catch (error) {
      console.error('[VendorAPI] Error al obtener la lista de stocks:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Obtiene el precio actual de un stock
   */
  async getStockPrice(symbol: string): Promise<number> {
    try {
      if (this.isCacheValid(symbol)) {
        return this.stockCache.get(symbol)!.price;
      }
      const cache = this.stockCache.get(symbol);
      const nextToken = this.shouldRefreshCache(symbol) && cache?.nextToken ? cache.nextToken : undefined;
      const response = await this.vendorStockRepository.listStocks(nextToken);
      const stock = response.data.items.find((item: any) => item.symbol === symbol);
      if (!stock) throw new Error('Stock not found');
      this.stockCache.set(symbol, {
        price: stock.price,
        timestamp: Date.now(),
        nextToken: response.data.nextToken
      });
      return stock.price;
    } catch (error) {
      console.error('Error fetching stock price:', error);
      throw error;
    }
  }

  /**
   * Ejecuta una compra de un stock
   * @param symbol Símbolo del stock
   * @param params Parámetros de la compra (precio y cantidad)
   * @returns Respuesta de la compra
   */
  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    try {
      const currentPrice = await this.getStockPrice(symbol);
      if (!this.isPriceWithinRange(currentPrice, params.price)) {
        throw new Error(`Price must be within 2% of current price ($${currentPrice})`);
      }
      return await this.vendorStockRepository.buyStock(symbol, params);
    } catch (error) {
      console.error(`[VendorAPI] Error al comprar el stock ${symbol}:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Maneja errores de la API
   * @param error Error de Axios
   * @returns Error formateado
   */
  private handleError(error: any): VendorApiError {
    if (error.response) {
      return {
        status: error.response.status,
        message: error.response.data.message || 'Error en la respuesta del servidor',
        code: error.response.data.code,
      };
    } else if (error.request) {
      return {
        status: 0,
        message: 'No se recibió respuesta del servidor',
      };
    } else {
      return {
        status: 0,
        message: error.message || 'Error en la petición',
      };
    }
  }
}
