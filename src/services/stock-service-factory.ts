import { StockService } from './stock-service';
import { StockServiceWithDynamoDB } from './stock-service-with-dynamodb';

/**
 * Factory para obtener la implementación adecuada del servicio de stocks
 * basado en la configuración del entorno
 */
export class StockServiceFactory {
  /**
   * Obtiene la implementación del servicio de stocks según la configuración
   * @returns Instancia del servicio de stocks
   */
  public static getStockService(): StockService | StockServiceWithDynamoDB {
    // Verificar si debemos usar DynamoDB como caché
    const useDynamoDB = process.env.USE_DYNAMODB_CACHE === 'true';
    
    if (useDynamoDB) {
      // Usar la implementación con DynamoDB
      return StockServiceWithDynamoDB.getInstance();
    } else {
      // Usar la implementación original
      return StockService.getInstance();
    }
  }
}
