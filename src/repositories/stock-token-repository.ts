import { DynamoDB } from 'aws-sdk';

export class StockTokenRepository {
  constructor(
    private dynamoDb: DynamoDB.DocumentClient,
    private tableName: string
  ) {}

  /**
   * Gets a stock's pagination token from DynamoDB
   * @param symbol Stock symbol
   * @returns Token string or null if not found
   */
  async getToken(symbol: string): Promise<string | null> {
    try {
      const params: DynamoDB.DocumentClient.GetItemInput = {
        TableName: this.tableName,
        Key: { symbol }
      };
      
      console.log(`Buscando token para ${symbol} en tabla ${this.tableName}...`);
      const result = await this.dynamoDb.get(params).promise();
      
      if (result.Item && 'nextToken' in result.Item) {
        console.log(`Token encontrado para ${symbol}: ${result.Item.nextToken}`);
        console.log(`Última actualización: ${result.Item.lastUpdated || 'desconocido'}`);
        return result.Item.nextToken;
      } else {
        console.log(`No se encontró token para ${symbol} en DynamoDB`);
        return null;
      }
    } catch (error) {
      console.error(`Error al obtener token para ${symbol} desde DynamoDB:`, error);
      return null;
    }
  }

  /**
   * Saves or updates a stock's pagination token in DynamoDB
   * @param symbol Stock symbol
   * @param nextToken Token string
   */
  async saveToken(symbol: string, nextToken: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const params: DynamoDB.DocumentClient.PutItemInput = {
        TableName: this.tableName,
        Item: {
          symbol,
          nextToken,
          lastUpdated: timestamp
        }
      };
      
      console.log(`Guardando token para ${symbol} en tabla ${this.tableName}: ${nextToken}`);
      await this.dynamoDb.put(params).promise();
      console.log(`Token guardado exitosamente para ${symbol} a las ${timestamp}`);
    } catch (error) {
      console.error(`Error al guardar token para ${symbol} en DynamoDB:`, error);
      throw error;
    }
  }
} 