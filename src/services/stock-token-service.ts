import { DynamoDB } from 'aws-sdk';

export class StockTokenService {
  private static instance: StockTokenService;
  private dynamoDb: DynamoDB.DocumentClient;
  private readonly tableName: string;

  private constructor() {
    const config: DynamoDB.DocumentClient.DocumentClientOptions & DynamoDB.ClientConfiguration = {
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
      }
    };

    if (process.env.DYNAMODB_ENDPOINT) {
      config.endpoint = process.env.DYNAMODB_ENDPOINT;
    }
    
    this.dynamoDb = new DynamoDB.DocumentClient(config);
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
      const params: DynamoDB.DocumentClient.GetItemInput = {
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