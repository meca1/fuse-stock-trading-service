import { DynamoDB } from 'aws-sdk';
import { VendorApiClient } from './vendor/api-client';

export class DailyStockTokenService {
  private static instance: DailyStockTokenService;
  private vendorApi: VendorApiClient;
  private dynamoDb: DynamoDB.DocumentClient;
  private readonly tableName: string;
  private isRunning = false;

  private constructor() {
    this.vendorApi = VendorApiClient.getInstance();
    
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
    this.tableName = process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local';
  }

  public static getInstance(): DailyStockTokenService {
    if (!DailyStockTokenService.instance) {
      DailyStockTokenService.instance = new DailyStockTokenService();
    }
    return DailyStockTokenService.instance;
  }

  public async updateStockTokens(): Promise<void> {
    if (this.isRunning) {
      console.log('Update already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Starting daily stock token update');

    try {
      let currentToken: string | undefined;
      const processedSymbols = new Set<string>();

      do {
        const response = await this.vendorApi.listStocks(currentToken);
        const stocks = response.data.items;
        const nextToken = response.data.nextToken;

        await Promise.all(
          stocks.map(async (stock) => {
            if (!processedSymbols.has(stock.symbol)) {
              await this.saveStockToken(stock.symbol, currentToken || '');
              processedSymbols.add(stock.symbol);
            }
          })
        );

        currentToken = nextToken;
      } while (currentToken);

      console.log(`Successfully updated tokens for ${processedSymbols.size} stocks`);
    } catch (error) {
      console.error('Error updating stock tokens:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async saveStockToken(symbol: string, nextToken: string): Promise<void> {
    const params: DynamoDB.DocumentClient.PutItemInput = {
      TableName: this.tableName,
      Item: {
        symbol,
        nextToken,
        lastUpdated: new Date().toISOString()
      }
    };

    try {
      await this.dynamoDb.put(params).promise();
      console.log(`Updated token for symbol ${symbol}`);
    } catch (error) {
      console.error(`Error saving token for symbol ${symbol}:`, error);
      throw error;
    }
  }
} 