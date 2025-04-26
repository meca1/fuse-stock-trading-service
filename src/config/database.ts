import dotenv from 'dotenv';
import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';

// Load environment variables
dotenv.config();

/**
 * Custom error class for database errors
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly detail?: string,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Options for database queries
 */
export interface QueryOptions {
  timeout?: number;
  rowMode?: 'array' | 'object';
}

// Define type for database configuration
type DbConfig = {
  user: string;
  password: string;
  database: string;
  host: string;
  port: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statement_timeout?: number;
  application_name?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
};

/**
 * Database service class with singleton pattern
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private isConnected: boolean = false;
  private lastHealthCheck: Date = new Date();
  private readonly healthCheckInterval: number = 30000; // 30 seconds

  /**
   * Private constructor to prevent direct instantiation
   */
  private constructor() {
    // Get database configuration from environment variables
    // These will be loaded by serverless-dotenv-plugin
    const dbConfig: DbConfig = {
      user: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'fuse_stock_trading_dev',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      max: process.env.NODE_ENV === 'test' ? 5 : 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to give more time for connection
      application_name: 'fuse-stock-trading-service',
      statement_timeout: 30000 // 30 seconds max per query
    };
    
    console.log(`Connecting to database at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Add SSL configuration for production
    if (process.env.NODE_ENV === 'production') {
      dbConfig.ssl = {
        rejectUnauthorized: false
      };
    }
    
    // Create database pool
    this.pool = new Pool(dbConfig as PoolConfig);
    
    // Log connection events in development
    if (process.env.NODE_ENV === 'development') {
      this.pool.on('connect', () => {
        console.log('Connected to PostgreSQL database');
        this.isConnected = true;
      });
    }
    
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      this.isConnected = false;
    });
  }

  /**
   * Get the singleton instance of the database service
   */
  public static async getInstance(): Promise<DatabaseService> {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
      await DatabaseService.instance.validateConnection();
    }
    return DatabaseService.instance;
  }

  /**
   * Validate the database connection
   */
  private async validateConnection(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.isConnected = true;
      this.lastHealthCheck = new Date();
    } catch (error) {
      this.isConnected = false;
      throw new DatabaseError(
        'Failed to connect to database',
        undefined,
        undefined,
        error
      );
    }
  }

  /**
   * Execute a SQL query with parameters
   */
  public async query<T extends QueryResultRow = any>(
    text: string, 
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    // Check connection status
    if (!this.isConnected) {
      await this.validateConnection();
    }

    // Check if health check is needed
    if (Date.now() - this.lastHealthCheck.getTime() > this.healthCheckInterval) {
      await this.healthCheck();
    }

    try {
      const queryConfig: any = {
        text,
        values: params
      };

      if (options?.timeout) {
        queryConfig.timeout = options.timeout;
      }

      if (options?.rowMode) {
        queryConfig.rowMode = options.rowMode;
      }

      const start = Date.now();
      const res = await this.pool.query<T>(queryConfig);
      const duration = Date.now() - start;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text, duration, rows: res.rowCount });
      }
      
      return res;
    } catch (error: any) {
      throw new DatabaseError(
        'Error executing query',
        error.code,
        error.detail,
        error
      );
    }
  }

  /**
   * Get a client from the pool
   */
  public async getClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    const originalRelease = client.release;
    
    // Monkey patch the release method to log query execution time
    client.release = () => {
      client.release = originalRelease;
      return client.release();
    };
    
    return client;
  }

  /**
   * Execute a transaction with the provided callback
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw new DatabaseError(
        'Error executing transaction',
        error.code,
        error.detail,
        error
      );
    } finally {
      client.release();
    }
  }

  /**
   * Perform a health check on the database connection
   */
  public async healthCheck(): Promise<boolean> {
    try {
      await this.validateConnection();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get statistics about the connection pool
   */
  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      isConnected: this.isConnected,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  /**
   * Close the connection pool
   */
  public async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
  }

  /**
   * Get the underlying pool instance (for compatibility with existing code)
   */
  public getPool(): Pool {
    return this.pool;
  }

  /**
   * Executes multiple queries in a transaction
   * @param queries Array of query objects with text and params
   * @returns Array of query results
   */
  public async executeQueries(queries: { text: string; params?: any[] }[]): Promise<any[]> {
    return this.transaction(async (client) => {
      const results = [];
      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result);
      }
      return results;
    });
  }
}

// DatabaseService and DatabaseError are already exported above
