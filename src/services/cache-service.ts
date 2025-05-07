import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';

/**
 * Interface for cache service configuration
 */
export interface CacheServiceConfig {
  tableName: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

/**
 * Service to handle DynamoDB caching operations
 */
export class CacheService {
  private readonly client: DynamoDBClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(config: CacheServiceConfig) {
    console.log('[CACHE SERVICE] Initializing with config:', {
      tableName: config.tableName,
      region: config.region,
      endpoint: config.endpoint,
      hasAccessKey: !!config.accessKeyId,
      hasSecretKey: !!config.secretAccessKey
    });

    if (!config.tableName) {
      throw new Error('tableName is required in CacheServiceConfig');
    }

    this.tableName = config.tableName;
    
    // Configuración específica para entorno local
    const isLocal = process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'development';
    
    const clientConfig = {
      region: isLocal ? 'local' : config.region,
      credentials: isLocal ? {
        accessKeyId: 'local',
        secretAccessKey: 'local'
      } : {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || ''
      },
      endpoint: isLocal ? 'http://localhost:8000' : config.endpoint
    };

    console.log('[CACHE SERVICE] Creating DynamoDB client with config:', clientConfig);
    
    this.client = new DynamoDBClient(clientConfig);

    this.docClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
      }
    });

    console.log('[CACHE SERVICE] Successfully initialized', {
      tableName: this.tableName,
      region: isLocal ? 'local' : config.region,
      endpoint: isLocal ? 'http://localhost:8000' : config.endpoint,
      isLocal
    });
  }

  /**
   * Get an item from the cache
   * @param key The key to retrieve
   * @returns The item data or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      console.log(`[CACHE] Getting item with key: ${key} from table: ${this.tableName}`);
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { key }
      });
      
      console.log('[CACHE] Executing GetCommand with params:', command.input);
      
      const result = await this.docClient.send(command);
      
      console.log('[CACHE] GetCommand result:', {
        hasItem: !!result.Item,
        itemKeys: result.Item ? Object.keys(result.Item) : []
      });
      
      if (result.Item?.data) {
        console.log(`[CACHE HIT] Found item for key: ${key}`);
        return result.Item.data as T;
      }
      
      console.log(`[CACHE MISS] No item found for key: ${key}`);
      return null;
    } catch (error) {
      console.error(`[CACHE ERROR] Error retrieving item for key ${key}:`, error);
      throw error; // Re-throw to handle in the caller
    }
  }

  /**
   * Save an item to the cache
   * @param key The key to save
   * @param data The data to cache
   * @param ttl Optional TTL in seconds
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    try {
      console.log('[CACHE] Saving item with key:', key, 'to table:', this.tableName, {
        item: {
          key,
          data,
          lastUpdated: new Date().toISOString()
        },
        dataType: typeof data,
        hasData: !!data,
        itemKeys: Object.keys({ key, data, lastUpdated: new Date().toISOString() }),
        itemValues: Object.values({ key, data, lastUpdated: new Date().toISOString() }),
        itemStructure: JSON.stringify({ key, data, lastUpdated: new Date().toISOString() }, null, 2),
        dataStructure: JSON.stringify(data, null, 2),
        isDataObject: typeof data === 'object',
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        dataValues: data && typeof data === 'object' ? Object.values(data) : []
      });

      // Adapt the item structure based on the table name
      const item = this.tableName.includes('stock-tokens') 
        ? {
            symbol: key,
            ...(typeof data === 'object' ? data : { value: data }),
            lastUpdated: new Date().toISOString()
          }
        : {
            key,
            data,
            lastUpdated: new Date().toISOString(),
            ...(ttl && { ttl: Math.floor(Date.now() / 1000) + ttl })
          };

      const command = new PutCommand({
        TableName: this.tableName,
        Item: item
      });

      console.log('[CACHE] Executing PutCommand with params:', {
        ...command.input,
        Item: JSON.stringify(command.input.Item, null, 2),
        ItemKeys: command.input.Item ? Object.keys(command.input.Item) : [],
        ItemValues: command.input.Item ? Object.values(command.input.Item) : []
      });

      await this.docClient.send(command);
    } catch (error: any) {
      console.error('[CACHE ERROR] Error saving item for key', key + ':', {
        error,
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.code,
        errorType: error.__type,
        errorMetadata: error.$metadata,
        stack: error.stack,
        item: {
          key,
          data,
          timestamp: new Date().toISOString()
        }
      });
      throw error;
    }
  }

  /**
   * Delete an item from the cache
   * @param key The key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      console.log(`[CACHE] Deleting item with key: ${key} from table: ${this.tableName}`);
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { key }
      });
      
      console.log('[CACHE] Executing DeleteCommand with params:', command.input);
      
      await this.docClient.send(command);
      console.log(`[CACHE] Successfully deleted item for key: ${key}`);
    } catch (error) {
      console.error(`[CACHE ERROR] Error deleting item for key ${key}:`, error);
      throw error; // Re-throw to handle in the caller
    }
  }

  /**
   * Check if the cache table exists and is accessible
   */
  async checkTableExists(): Promise<boolean> {
    try {
      console.log(`[CACHE] Checking if table ${this.tableName} exists`);
      const command = new DescribeTableCommand({
        TableName: this.tableName
      });
      
      console.log('[CACHE] Executing DescribeTableCommand with params:', command.input);
      
      await this.docClient.send(command);
      
      console.log(`[CACHE] Table ${this.tableName} exists and is accessible`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('ResourceNotFoundException')) {
        console.error(`[CACHE ERROR] Table ${this.tableName} does not exist:`, errorMessage);
        return false;
      }
      
      console.error(`[CACHE ERROR] Error checking table ${this.tableName}:`, error);
      return false;
    }
  }
} 