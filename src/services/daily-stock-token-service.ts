import { VendorApiClient } from './vendor/api-client';
import { StockTokenRepository } from '../repositories/stock-token-repository';
import { DynamoDB } from 'aws-sdk';

export class DailyStockTokenService {
  private isRunning = false;
  private dynamoDb: DynamoDB;

  constructor(
    private stockTokenRepository: StockTokenRepository,
    private vendorApi: VendorApiClient
  ) {
    // Initialize DynamoDB client for verifications
    this.dynamoDb = new DynamoDB({
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
      },
      endpoint: process.env.DYNAMODB_ENDPOINT
    });
  }

  /**
   * Checks if the table exists before performing operations
   * Public method that can be called from other services
   */
  public async checkTableExists(tableName: string): Promise<boolean> {
    try {
      console.log(`Checking if table ${tableName} exists...`);
      await this.dynamoDb.describeTable({ TableName: tableName }).promise();
      console.log(`¡Table ${tableName} exists!`);
      return true;
    } catch (error: any) {
      if (error.code === 'ResourceNotFoundException') {
        console.warn(`Table ${tableName} does not exist. Creating table...`);
        await this.createTable(tableName);
        return true;
      }
      console.error(`Error checking table ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Creates the table if it doesn't exist
   */
  private async createTable(tableName: string): Promise<void> {
    try {
      await this.dynamoDb.createTable({
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'symbol', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'symbol', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }).promise();
      
      // Esperar a que la tabla esté activa
      let tableActive = false;
      while (!tableActive) {
        console.log(`Waiting for table ${tableName} to become active...`);
        const response = await this.dynamoDb.describeTable({ TableName: tableName }).promise();
        if (response.Table && response.Table.TableStatus === 'ACTIVE') {
          tableActive = true;
          console.log(`Table ${tableName} is now active`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error: any) {
      console.error(`Error creating table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Updates stock tokens with robust error handling
   */
  public async updateStockTokens(): Promise<void> {
    if (this.isRunning) {
      console.log('Update already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Starting daily stock token update');

    try {
      // Get repository table name
      const tableName = process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local';
      
      // Check if table exists
      const tableExists = await this.checkTableExists(tableName);
      if (!tableExists) {
        throw new Error(`Table ${tableName} does not exist and could not be created`);
      }

      let currentToken: string | undefined;
      const processedSymbols = new Set<string>();
      const failedSymbols: string[] = [];

      do {
        console.log(`Getting batch of stocks${currentToken ? ' with token' : ''}...`);
        const response = await this.vendorApi.listStocks(currentToken);
        const stocks = response.data.items;
        const nextToken = response.data.nextToken;
        
        console.log(`Processing batch of ${stocks.length} stocks...`);

        // Process in larger batches to cover more stocks
        const batchSize = 25;
        for (let i = 0; i < stocks.length; i += batchSize) {
          const batch = stocks.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async (stock) => {
              if (!processedSymbols.has(stock.symbol)) {
                try {
                  // We save the token for the page where the stock was found
                  await this.stockTokenRepository.saveToken(stock.symbol, currentToken || '');
                  processedSymbols.add(stock.symbol);
                } catch (error: any) {
                  console.error(`Error saving token for stock`, error);
                  failedSymbols.push(stock.symbol);
                  // Don't propagate the error so other symbols continue processing
                }
              }
            })
          );
        }

        currentToken = nextToken;
      } while (currentToken);

      console.log(`Successfully updated tokens for ${processedSymbols.size} stocks`);
      if (failedSymbols.length > 0) {
        console.warn(`Token update failed for ${failedSymbols.length} stocks: ${failedSymbols.join(', ')}`);
      }
    } catch (error: any) {
      console.error('Error in stock token update:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
} 