import axios, { AxiosInstance, AxiosError } from 'axios';
import { ListStocksResponse, BuyStockParams, BuyStockResponse, VendorApiError } from '../types/vendor/stock-api';

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
   * @param params Parámetros de la compra (precio y cantidad).
   * @returns Promesa con la respuesta de la compra.
   * @throws Error personalizado según la respuesta de la API
   */
  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 segundo
    
    let lastError: any;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Buying stock ${symbol}, attempt ${attempt}/${MAX_RETRIES}`);
        const response = await this.client.post(`/stocks/${symbol}/buy`, params);
        return response.data;
      } catch (error) {
        lastError = error;
        
        // Si es un error de Axios con respuesta
        if (axios.isAxiosError(error) && error.response) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          const errorData = axiosError.response?.data as VendorApiError;
          
          // Para errores 500, reintentamos
          if (status === 500) {
            console.log(`Server error (500) on attempt ${attempt}, retrying...`);
            if (attempt < MAX_RETRIES) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
              continue;
            }
          }
          
          // Para errores 400, 404, etc. no reintentamos
          if (errorData && errorData.message) {
            const apiError = new Error(errorData.message);
            (apiError as any).status = status;
            (apiError as any).code = errorData.code;
            throw apiError;
          }
        }
        
        // Si llegamos aquí, o bien hemos agotado los reintentos o es un error diferente
        break;
      }
    }
    
    // Si llegamos aquí es porque agotamos los reintentos o hubo otro tipo de error
    throw lastError;
  }
} 