import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import {
  ListStocksResponse,
  BuyStockParams,
  BuyStockResponse,
  VendorApiError,
  VendorStock,
} from '../services/vendor/types/stock-api';
import { VendorApiConfig } from '../services/vendor/types/vendor-api';
import { DEFAULT_VENDOR_API_CONFIG } from '../config/vendor-api';
import { VendorApiException } from '../utils/errors/vendor-api-error';
import { StockService } from '../services/stock-service';

/**
 * Repository for interacting with the external stock API (Vendor).
 *
 * This repository provides methods for:
 * - Listing available stocks with pagination
 * - Executing stock purchases
 *
 * Implemented features:
 * - Circuit breaker to prevent cascading failures
 * - Exponential backoff retry for 500 errors
 * - Input parameter validation
 * - Typed error handling
 *
 * @example
 * ```typescript
 * const repo = new VendorApiRepository();
 *
 * // List stocks
 * const stocks = await repo.listStocks();
 *
 * // Buy stocks
 * const purchase = await repo.buyStock('AAPL', { price: 150, quantity: 10 });
 * ```
 */
export class VendorApiRepository {
  private client: AxiosInstance;
  private config: VendorApiConfig;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private circuitOpen: boolean = false;
  private stockService: StockService;

  /**
   * Initializes the repository with a configured Axios client.
   * @param config Optional configuration for the repository
   */
  constructor(config: Partial<VendorApiConfig> = {}, stockService: StockService) {
    this.config = { ...DEFAULT_VENDOR_API_CONFIG, ...config };
    this.client = this.createAxiosClient();
    this.stockService = stockService;
  }

  /**
   * Creates and configures the Axios client
   * @returns Configured Axios instance
   */
  private createAxiosClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
      timeout: this.config.timeout,
    });
  }

  /**
   * Validates input parameters for API calls
   * @param symbol Stock symbol to validate
   * @param params Optional buy parameters to validate
   * @throws VendorApiException if validation fails
   */
  private validateInput(symbol: string, params?: BuyStockParams): void {
    if (!symbol || typeof symbol !== 'string') {
      throw new VendorApiException('Invalid stock symbol', 400, 'INVALID_SYMBOL');
    }

    if (params) {
      if (typeof params.price !== 'number' || params.price <= 0) {
        throw new VendorApiException('Invalid price parameter', 400, 'INVALID_PRICE');
      }
      if (typeof params.quantity !== 'number' || params.quantity <= 0) {
        throw new VendorApiException('Invalid quantity parameter', 400, 'INVALID_QUANTITY');
      }
    }
  }

  /**
   * Implements exponential backoff for retries
   * @param attempt Current attempt number
   * @returns Promise that resolves after the calculated delay
   */
  private async delay(attempt: number): Promise<void> {
    const delay = Math.min(
      this.config.initialRetryDelay * Math.pow(2, attempt - 1),
      this.config.maxRetryDelay,
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Checks if the circuit breaker should be opened
   * @throws VendorApiException if circuit breaker is open
   */
  private checkCircuitBreaker(): void {
    const now = Date.now();
    if (this.circuitOpen) {
      if (now - this.lastFailureTime > this.config.circuitBreakerTimeout) {
        this.circuitOpen = false;
        this.failureCount = 0;
      } else {
        throw new VendorApiException('Circuit breaker is open', 503, 'CIRCUIT_OPEN', true);
      }
    }
  }

  /**
   * Records a failure and updates circuit breaker state
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitOpen = true;
    }
  }

  /**
   * Records a success and resets failure count
   */
  private recordSuccess(): void {
    this.failureCount = 0;
  }

  /**
   * Makes an API request with retry logic and circuit breaker
   * @param method HTTP method to use
   * @param url Endpoint URL
   * @param config Optional Axios request configuration
   * @param data Optional request body data
   * @returns Promise with the API response data
   * @throws VendorApiException if the request fails
   */
  private async makeRequest<T>(
    method: 'get' | 'post',
    url: string,
    config?: AxiosRequestConfig,
    data?: any,
  ): Promise<T> {
    this.checkCircuitBreaker();

    let lastError: any;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(
          `Making ${method.toUpperCase()} request to ${url}, attempt ${attempt}/${this.config.maxRetries}`,
        );

        const response =
          method === 'get'
            ? await this.client.get(url, config)
            : await this.client.post(url, data, config);

        this.recordSuccess();
        return response.data;
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && error.response) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          const errorData = axiosError.response?.data as VendorApiError;

          // Log detailed error information
          console.error('API request failed', {
            url,
            method,
            status,
            errorCode: errorData?.code,
            errorMessage: errorData?.message,
            attempt,
          });

          // Handle different error scenarios
          if (status === 500) {
            this.recordFailure();
            if (attempt < this.config.maxRetries) {
              await this.delay(attempt);
              continue;
            }
          }

          if (errorData?.message) {
            throw new VendorApiException(errorData.message, status, errorData.code, status === 500);
          }
        }

        break;
      }
    }

    throw lastError;
  }

  /**
   * Gets the list of available stocks from the external provider.
   * The response includes the current price for each stock.
   *
   * @param nextToken Optional pagination token to get more results
   * @returns Promise with the API response including the list of stocks and nextToken
   * @throws VendorApiException if there's an error communicating with the API
   */
  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    const config: AxiosRequestConfig = {};
    if (nextToken) {
      config.params = { nextToken };
    }
    return this.makeRequest<ListStocksResponse>('get', '/stocks', config);
  }

  /**
   * Executes a stock purchase through the external API.
   *
   * @param symbol Stock symbol to buy
   * @param params Purchase parameters (price and quantity)
   * @returns Promise with the purchase response
   * @throws VendorApiException if:
   * - Parameters are invalid
   * - Stock doesn't exist
   * - There's an error communicating with the API
   * - Price is not within allowed range
   */
  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    this.validateInput(symbol, params);

    return this.makeRequest<BuyStockResponse>('post', `/stocks/${symbol}/buy`, undefined, params);
  }

  /**
   * Gets a single stock by symbol
   * @param symbol Stock symbol to get
   * @returns Stock data or null if not found
   */
  async getStock(symbol: string): Promise<VendorStock | null> {
    this.validateInput(symbol);

    try {
      // Use StockService's cache
      const stock = await this.stockService.getStockBySymbol(symbol);
      if (stock) {
        console.log(`[STOCK CACHE HIT] Found ${symbol} in cache`);
        return stock;
      }

      console.log(`[STOCK CACHE MISS] ${symbol} not found in cache, fetching from API`);
      
      let nextToken: string | undefined;
      let pageCount = 0;
      const MAX_PAGES = 10;

      do {
        const config: AxiosRequestConfig = {};
        if (nextToken) {
          config.params = { nextToken };
        }

        const response = await this.makeRequest<ListStocksResponse>('get', '/stocks', config);
        console.log(`[STOCK API] Received ${response.data.items.length} stocks from API on page ${pageCount + 1}`);
        
        const stock = response.data.items.find(item => item.symbol === symbol);
        if (stock) {
          console.log(`[STOCK API] Found stock ${symbol} with price ${stock.price} on page ${pageCount + 1}`);
          return {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            exchange: stock.exchange || 'NYSE',
          };
        }

        nextToken = response.data.nextToken;
        pageCount++;

        if (nextToken) {
          console.log(`[STOCK API] Moving to next page ${pageCount + 1}`);
        }
      } while (nextToken && pageCount < MAX_PAGES);

      console.log(`[STOCK API] Stock ${symbol} not found after searching ${pageCount} pages`);
      return null;
    } catch (error) {
      console.error(`[STOCK API ERROR] Error getting stock ${symbol}:`, error);
      if (error instanceof VendorApiException) {
        throw error;
      }
      throw new VendorApiException(
        `Error getting stock ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        'API_ERROR',
      );
    }
  }
}
