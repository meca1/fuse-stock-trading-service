import { DynamoDB } from 'aws-sdk';
import AWS from 'aws-sdk';

export class StockTokenService {
  private static instance: StockTokenService;
  private dynamoDb: DynamoDB.DocumentClient;
  private readonly tableName: string;

  private constructor() {
    AWS.config.update({
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
      endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
    });
    
    this.dynamoDb = new DynamoDB.DocumentClient();
    this.tableName = process.env.DYNAMODB_TABLE || 'stock_tokens-local';
  }

  public static getInstance(): StockTokenService {
    if (!StockTokenService.instance) {
      StockTokenService.instance = new StockTokenService();
    }
    return StockTokenService.instance;
  }

  public async getStockToken(symbol: string): Promise<string | null> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          symbol
        }
      };

      const result = await this.dynamoDb.get(params).promise();
      return result.Item?.nextToken || null;
    } catch (error) {
      console.error(`Error getting token for symbol ${symbol}:`, error);
      throw error;
    }
  }
} 