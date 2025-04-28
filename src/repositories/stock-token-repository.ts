import { DynamoDB } from 'aws-sdk';

export class StockTokenRepository {
  private dynamoDb: DynamoDB.DocumentClient;
  private tableName: string;

  constructor(dynamoDb?: DynamoDB.DocumentClient, tableName?: string) {
    this.dynamoDb = dynamoDb || new DynamoDB.DocumentClient({
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
      },
      endpoint: process.env.DYNAMODB_ENDPOINT
    });
    this.tableName = tableName || process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local';
  }

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