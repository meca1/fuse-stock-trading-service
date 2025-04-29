import { VendorApiClient } from './vendor/api-client';
import { VendorStock, ListStocksResponse, EnhancedVendorStock } from '../types/models/stock';
import { StockTokenRepository } from '../repositories/stock-token-repository';

// Cache para almacenar resultados de stocks
interface StockCache {
  [symbol: string]: {
    data: VendorStock;
    timestamp: number;
  }
}

/**
 * Service to handle stock-related operations and token management
 */
export class StockService {
  private stockCache: StockCache = {};
  private CACHE_TTL = 300 * 1000; // 5 minutes in milliseconds (increased from 1 to 5 minutes)
  // Evitar solicitudes duplicadas - Promise puede ser null pero TypeScript debe saberlo
  private requestsInProgress: Record<string, Promise<VendorStock | null>> = {};

  constructor(
    private stockTokenRepository: StockTokenRepository,
    private vendorApi: VendorApiClient
  ) {}

  /**
   * Obtiene el repositorio de tokens para uso externo
   */
  public getStockTokenRepository(): StockTokenRepository {
    return this.stockTokenRepository;
  }

  /**
   * Obtiene el cliente de API del vendor para uso externo
   */
  public getVendorApi(): VendorApiClient {
    return this.vendorApi;
  }

  /**
   * Executes a stock purchase through the vendor API
   * @param symbol Stock symbol
   * @param price Price to buy at
   * @param quantity Quantity to buy
   * @returns Response from the vendor API
   */
  public async buyStock(symbol: string, price: number, quantity: number): Promise<any> {
    try {
      // First check if the stock exists
      const stock = await this.getStockBySymbol(symbol);
      if (!stock) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }
      
      // Then validate the price
      if (!this.isValidPrice(stock.price, price)) {
        throw new Error(`Price must be within 2% of current price ($${stock.price})`);
      }
      
      // Execute the purchase
      const response = await this.vendorApi.buyStock(symbol, {
        price,
        quantity
      });
      
      return response;
    } catch (error) {
      console.error(`Error buying stock ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Gets a stock's pagination token from the repository
   * @param symbol Stock symbol
   * @returns Token string or null if not found
   */
  private async getStockToken(symbol: string): Promise<string | null> {
    return this.stockTokenRepository.getToken(symbol);
  }

  /**
   * Gets all available stocks, combining data from the vendor and local database
   * @param nextToken Optional token for pagination
   * @param search Optional search string for symbol or name
   * @returns Object containing list of stocks and nextToken for pagination
   */
  async listAllStocks(nextToken?: string, search?: string): Promise<{ stocks: any[], nextToken?: string, totalItems?: number, lastUpdated?: string }> {
    try {
      const { stocks: vendorStocks, nextToken: newNextToken } = await this.fetchAllVendorStocks(1, nextToken);
      let filteredStocks = vendorStocks;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredStocks = vendorStocks.filter(s =>
          s.symbol.toLowerCase().includes(searchLower) ||
          (s.name && s.name.toLowerCase().includes(searchLower))
        );
      }
      
      const stocks = filteredStocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        currency: 'USD',
        lastUpdated: stock.timestamp,
        market: stock.exchange || 'NYSE',
        percentageChange: stock.percentageChange,
        volume: stock.volume,
      }));

      return {
        stocks,
        nextToken: newNextToken,
        totalItems: vendorStocks.length,
        lastUpdated: stocks.length > 0 ? stocks[0].lastUpdated : undefined
      };
    } catch (error) {
      console.error('Error getting stock list:', error);
      throw error;
    }
  }

  /**
   * Verifica si el precio está dentro del 2% del precio actual
   */
  public isValidPrice(currentPrice: number, requestedPrice: number): boolean {
    const priceDiff = Math.abs(requestedPrice - currentPrice);
    const maxDiff = currentPrice * 0.02;
    return priceDiff <= maxDiff;
  }

  /**
   * Gets a specific stock by its symbol, using cache when possible
   * @param symbol Stock symbol
   * @returns Stock or null if it doesn't exist
   */
  public async getStockBySymbol(symbol: string): Promise<VendorStock | null> {
    // Si ya hay una solicitud en curso para este símbolo, reutilizarla
    if (symbol in this.requestsInProgress) {
      console.log(`Request already in progress for ${symbol}, reusing promise`);
      return this.requestsInProgress[symbol];
    }

    // Crear una nueva promesa para esta solicitud y guardarla
    const requestPromise = this._fetchStockBySymbol(symbol);
    this.requestsInProgress[symbol] = requestPromise;

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Limpiar la referencia cuando se complete
      delete this.requestsInProgress[symbol];
    }
  }

  /**
   * Implementación interna de búsqueda de stock
   */
  private async _fetchStockBySymbol(symbol: string): Promise<VendorStock | null> {
    try {
      // Verificar caché primero
      const now = Date.now();
      const cachedStock = this.stockCache[symbol];
      
      if (cachedStock && (now - cachedStock.timestamp) < this.CACHE_TTL) {
        console.log(`Using cached data for ${symbol}, age: ${(now - cachedStock.timestamp)/1000}s`);
        return cachedStock.data;
      }
      
      console.log(`Searching for token for ${symbol} in DynamoDB...`);
      // Primero buscamos en la tabla de DynamoDB para obtener el token de la acción
      const token = await this.getStockToken(symbol);
      
      if (token) {
        console.log(`Token found for ${symbol} in DynamoDB, using token: ${token}`);
        try {
          // Usamos el token para acceder directamente a la página correcta
          const response = await this.vendorApi.listStocks(token);
          const stock = response.data.items.find(item => item.symbol === symbol);
          
          if (stock) {
            console.log(`Stock ${symbol} found with DynamoDB token`);
            const vendorStock = {
              symbol: stock.symbol,
              name: stock.name,
              price: stock.price,
              exchange: stock.exchange || 'NYSE'
            };
            
            // Guardar en caché
            this.stockCache[symbol] = {
              data: vendorStock,
              timestamp: now
            };
            
            return vendorStock;
          } else {
            console.log(`Stock ${symbol} not found with stored token, starting search in multiple pages`);
          }
        } catch (error) {
          console.warn(`Error using token for ${symbol}, starting search in multiple pages`, error);
        }
      } else {
        console.log(`Token not found for ${symbol} in DynamoDB, starting search in multiple pages`);
      }

      // Si no hay token en DynamoDB o no encontramos el stock con el token,
      // buscamos en varias páginas
      console.log(`Searching for ${symbol} in multiple pages...`);
      
      let currentToken: string | undefined = undefined;
      let pageCount = 0;
      const MAX_PAGES = 10;
      
      do {
        console.log(`Searching for ${symbol} in page ${pageCount + 1}`);
        const response = await this.vendorApi.listStocks(currentToken);
        const stock = response.data.items.find(item => item.symbol === symbol);
        
        if (stock) {
          console.log(`Found stock ${symbol} in page ${pageCount + 1}`);
          const vendorStock = {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            exchange: stock.exchange || 'NYSE'
          };
          
          // Guardar token para optimizar búsquedas futuras
          console.log(`Saving token for ${symbol} in DynamoDB for future searches`);
          await this.stockTokenRepository.saveToken(symbol, currentToken || '');
          
          // Guardar en caché
          this.stockCache[symbol] = {
            data: vendorStock,
            timestamp: now
          };
          
          return vendorStock;
        }
        
        currentToken = response.data.nextToken;
        pageCount++;
        
      } while (currentToken && pageCount < MAX_PAGES);
      
      console.warn(`Stock not found: ${symbol} after searching in ${pageCount} pages`);
      return null;
    } catch (error) {
      console.error(`Error getting stock ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Fetches stocks from the vendor API
   * @param maxPages Maximum number of pages to fetch (default: 1)
   * @param startToken Optional token to start pagination from
   * @returns Object containing list of vendor stocks and nextToken for pagination
   */
  private async fetchAllVendorStocks(maxPages: number = 1, startToken?: string): Promise<{ stocks: EnhancedVendorStock[], nextToken?: string }> {
    try {
      let allStocks: EnhancedVendorStock[] = [];
      let nextToken: string | undefined = startToken;
      let pageCount = 0;
      do {
        const response: ListStocksResponse = await this.vendorApi.listStocks(nextToken);
        const stocksWithPagination: EnhancedVendorStock[] = response.data.items.map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          exchange: stock.exchange || 'NYSE',
          timestamp: stock.timestamp,
          pageToken: response.data.nextToken || undefined
        }));
        allStocks = [...allStocks, ...stocksWithPagination];
        nextToken = response.data.nextToken;
        pageCount++;
        if (pageCount >= maxPages) {
          break;
        }
      } while (nextToken);
      return {
        stocks: allStocks,
        nextToken
      };
    } catch (error) {
      console.error('Error fetching vendor stocks:', error);
      throw error;
    }
  }

  public async getCurrentPrice(symbol: string): Promise<{ price: number }> {
    try {
      const stock = await this.getStockBySymbol(symbol);
      if (!stock) {
        throw new Error(`Stock not found: ${symbol}`);
      }
      return { price: stock.price };
    } catch (error) {
      console.error(`Error getting current price for ${symbol}:`, error);
      throw error;
    }
  }
}
