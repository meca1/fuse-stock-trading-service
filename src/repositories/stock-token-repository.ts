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
    const params: DynamoDB.DocumentClient.GetItemInput = {
      TableName: this.tableName,
      Key: { symbol }
    };
    const result = await this.dynamoDb.get(params).promise();
    return result.Item && 'nextToken' in result.Item ? result.Item.nextToken : null;
  }

  /**
   * Saves or updates a stock's pagination token in DynamoDB
   * @param symbol Stock symbol
   * @param nextToken Token string
   */
  async saveToken(symbol: string, nextToken: string): Promise<void> {
    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: this.tableName,
      Item: {
        symbol,
        nextToken,
        lastUpdated: new Date().toISOString()
      }
    };
    await this.dynamoDb.put(params).promise();
  }
} 