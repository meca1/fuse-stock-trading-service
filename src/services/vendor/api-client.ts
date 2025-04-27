import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { ListStocksResponse, BuyStockParams, BuyStockResponse, VendorApiError } from '../../types/vendor/stock-api';

/**
 * Cliente para interactuar con la API del proveedor de stocks
 */
export class VendorApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.VENDOR_API_URL || 'https://api.challenge.fusefinance.com';
    this.apiKey = process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e';

    // Crear cliente HTTP
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      timeout: 10000, // 10 segundos de timeout
    });

    // Configurar reintentos para manejar errores temporales
    axiosRetry(this.client, {
      retries: 3, // Número de reintentos
      retryDelay: (retryCount) => {
        return retryCount * 1000; // Tiempo entre reintentos (1s, 2s, 3s)
      },
      retryCondition: (error) => {
        // Reintentar en errores de red o 5xx
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response && error.response.status >= 500) || false;
      },
    });

    // Interceptor para loguear peticiones
    this.client.interceptors.request.use((config) => {
      console.log(`[VendorAPI] Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Interceptor para loguear respuestas y errores
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[VendorAPI] Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(`[VendorAPI] Error: ${error.response.status} ${error.config.url}`, error.response.data);
        } else {
          console.error(`[VendorAPI] Error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Obtiene la lista de stocks disponibles
   * @param nextToken Token para paginación
   * @returns Lista de stocks
   */
  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    try {
      const config: AxiosRequestConfig = {};
      if (nextToken) {
        config.params = { nextToken };
      }

      const response: AxiosResponse<ListStocksResponse> = await this.client.get('/stocks', config);
      return response.data;
    } catch (error) {
      console.error('[VendorAPI] Error al obtener la lista de stocks:', error);
      throw this.handleError(error);
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
      const response: AxiosResponse<BuyStockResponse> = await this.client.post(
        `/stocks/${symbol}/buy`,
        params
      );
      return response.data;
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
      // Error con respuesta del servidor
      return {
        status: error.response.status,
        message: error.response.data.message || 'Error en la respuesta del servidor',
        code: error.response.data.code,
      };
    } else if (error.request) {
      // Error sin respuesta del servidor
      return {
        status: 0,
        message: 'No se recibió respuesta del servidor',
      };
    } else {
      // Error en la configuración de la petición
      return {
        status: 0,
        message: error.message || 'Error en la petición',
      };
    }
  }

  async getStock(symbol: string, token?: string | null) {
    const params = token ? { token } : {};
    return this.client.get(`/stocks/${symbol}`, { params });
  }
}
