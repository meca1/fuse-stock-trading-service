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
      
      console.log(`Searching for token for ${symbol} in table ${this.tableName}...`);
      const result = await this.dynamoDb.get(params).promise();
      
      if (result.Item && 'nextToken' in result.Item) {
        console.log(`Token found for ${symbol}: ${result.Item.nextToken}`);
        console.log(`Last update: ${result.Item.lastUpdated || 'unknown'}`);
        return result.Item.nextToken;
      } else {
        console.log(`Token not found for ${symbol} in DynamoDB`);
        return null;
      }
    } catch (error) {
      console.error(`Error retrieving token for ${symbol} from DynamoDB:`, error);
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
      
      console.log(`Saving token for ${symbol} in table ${this.tableName}: ${nextToken}`);
      await this.dynamoDb.put(params).promise();
      console.log(`Token successfully saved for ${symbol} at ${timestamp}`);
    } catch (error) {
      console.error(`Error saving token for ${symbol} in DynamoDB:`, error);
      throw error;
    }
  }
} 