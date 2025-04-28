import axios, { AxiosInstance } from 'axios';
import { ListStocksResponse, BuyStockParams, BuyStockResponse } from '../types/vendor/stock-api';

/**
 * Repositorio para interactuar con la API externa de stocks (Vendor).
 * Encapsula las llamadas HTTP para listar, obtener precio y comprar acciones.
 */
export class VendorApiRepository {
  private client: AxiosInstance;

  /**
   * Inicializa el repositorio con un cliente Axios configurado.
   */
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

  /**
   * Obtiene la lista de acciones disponibles desde el proveedor externo.
   * @param nextToken Token de paginación opcional.
   * @returns Promesa con la respuesta de la API (lista de acciones y nextToken).
   */
  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    const config: any = {};
    if (nextToken) {
      config.params = { nextToken };
    }
    const response = await this.client.get('/stocks', config);
    return response.data;
  }

  /**
   * Obtiene el precio actual de una acción por su símbolo.
   * @param symbol Símbolo de la acción.
   * @param nextToken Token de paginación opcional.
   * @returns Promesa con el precio de la acción.
   * @throws Si la acción no se encuentra.
   */
  async getStockPrice(symbol: string, nextToken?: string): Promise<number> {
    const response = await this.listStocks(nextToken);
    const stock = response.data.items.find((item: any) => item.symbol === symbol);
    if (!stock) throw new Error('Stock not found');
    return stock.price;
  }

  /**
   * Ejecuta la compra de una acción a través de la API externa.
   * @param symbol Símbolo de la acción a comprar.
   * @param params Parámetros de la compra (portafolio, precio, cantidad).
   * @returns Promesa con la respuesta de la compra.
   */
  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    const response = await this.client.post(`/stocks/${symbol}/buy`, params);
    return response.data;
  }
} 