import dotenv from 'dotenv';
import { Pool, PoolConfig } from 'pg';

// Load environment variables
dotenv.config();

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
  ssl?: boolean | { rejectUnauthorized: boolean };
};

// Unified database configuration
const dbConfig: DbConfig = {
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fuse_stock_trading_dev',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: process.env.NODE_ENV === 'test' ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};

// Add SSL configuration for production
if (process.env.NODE_ENV === 'production') {
  dbConfig.ssl = {
    rejectUnauthorized: false
  };
}

// Create database pool
const pool = new Pool(dbConfig as PoolConfig);

// Log connection events in development
if (process.env.NODE_ENV === 'development') {
  pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
}

export default pool;
