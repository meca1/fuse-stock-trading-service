import { documentClient, STOCK_CACHE_TABLE } from '../config/dynamodb';
import { VendorStock } from '../types/vendor';

// Interfaz para los elementos en la caché
interface StockCacheItem {
  symbol: string;
  name: string;
  price: number;
  pageToken?: string;
  timestamp: number;
  ttl: number; // Tiempo de expiración para DynamoDB TTL
}

export class StockCacheService {
  private static instance: StockCacheService;
  private readonly cacheTTL: number = 5 * 60; // 5 minutos en segundos
  private readonly refreshThreshold: number = 4 * 60; // 4 minutos en segundos

  private constructor() {}

  public static getInstance(): StockCacheService {
    if (!StockCacheService.instance) {
      StockCacheService.instance = new StockCacheService();
    }
    return StockCacheService.instance;
  }

  /**
   * Guarda información de stock en la caché
   * @param stock Información del stock a guardar
   * @param pageToken Token de paginación asociado
   */
  public async setStock(stock: VendorStock, pageToken?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // Tiempo actual en segundos
    const ttl = now + this.cacheTTL; // Tiempo de expiración

    const item: StockCacheItem = {
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      pageToken: pageToken || undefined,
      timestamp: now,
      ttl: ttl
    };

    const params = {
      TableName: STOCK_CACHE_TABLE,
      Item: item
    };

    try {
      await documentClient.put(params).promise();
    } catch (error) {
      // Si hay un error al guardar en DynamoDB, lo registramos pero no interrumpimos el flujo
      console.error(`Error al guardar ${stock.symbol} en caché:`, error);
    }
  }

  /**
   * Obtiene información de stock desde la caché
   * @param symbol Símbolo del stock a buscar
   * @returns Información del stock o null si no existe o está expirado
   */
  public async getStock(symbol: string): Promise<{ stock: VendorStock; pageToken?: string; needsRefresh: boolean } | null> {
    const params = {
      TableName: STOCK_CACHE_TABLE,
      Key: { symbol }
    };

    try {
      const result = await documentClient.get(params).promise();
      const item = result.Item as StockCacheItem;

      if (!item) {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);
      const age = now - item.timestamp;

      // Si el elemento está expirado, devolvemos null
      if (age > this.cacheTTL) {
        return null;
      }

      // Determinar si necesita actualización (más de 4 minutos pero menos de 5)
      const needsRefresh = age > this.refreshThreshold;

      return {
        stock: {
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          exchange: 'NYSE', // Valor por defecto
          timestamp: new Date(item.timestamp * 1000).toISOString()
        },
        pageToken: item.pageToken,
        needsRefresh
      };
    } catch (error) {
      console.error(`Error al obtener ${symbol} desde caché:`, error);
      return null;
    }
  }

  /**
   * Guarda múltiples stocks en la caché
   * @param stocks Lista de stocks a guardar
   * @param pageToken Token de paginación asociado a esta página de resultados
   */
  public async setStocks(stocks: VendorStock[], pageToken?: string): Promise<void> {
    // Procesamos los stocks en lotes para evitar sobrecargar DynamoDB
    const batchSize = 25; // DynamoDB permite hasta 25 elementos por operación de escritura por lotes
    
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + this.cacheTTL;
      
      const putRequests = batch.map(stock => ({
        PutRequest: {
          Item: {
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            pageToken: pageToken || undefined,
            timestamp: now,
            ttl: ttl
          }
        }
      }));
      
      const params = {
        RequestItems: {
          [STOCK_CACHE_TABLE]: putRequests
        }
      };
      
      try {
        await documentClient.batchWrite(params).promise();
      } catch (error) {
        console.error('Error al guardar stocks en lote:', error);
        // Continuamos con el siguiente lote aunque haya error
      }
    }
  }

  /**
   * Elimina un stock de la caché
   * @param symbol Símbolo del stock a eliminar
   */
  public async deleteStock(symbol: string): Promise<void> {
    const params = {
      TableName: STOCK_CACHE_TABLE,
      Key: { symbol }
    };

    try {
      await documentClient.delete(params).promise();
    } catch (error) {
      console.error(`Error al eliminar ${symbol} de la caché:`, error);
    }
  }
}

export default StockCacheService;
