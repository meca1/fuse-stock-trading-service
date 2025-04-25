import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define types for database configuration
type DbConfigBase = {
  username: string;
  password: string;
  database: string;
  host: string;
  port: number;
  dialect: 'postgres';
  logging: boolean | ((sql: string, timing?: number) => void);
  ssl?: boolean;
  dialectOptions?: {
    ssl?: {
      require: boolean;
      rejectUnauthorized: boolean;
    };
  };
};

type DbConfigEnv = {
  development: DbConfigBase;
  test: DbConfigBase;
  production: DbConfigBase;
};

// Configuration for different environments
const dbConfig: DbConfigEnv = {
  development: {
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'fuse_stock_trading_dev',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: console.log,
  },
  test: {
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'fuse_stock_trading_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
  },
  production: {
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    ssl: true,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};

// Determine current environment
const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env as keyof typeof dbConfig];

// Create Sequelize instance
const sequelize = new Sequelize({
  database: config.database,
  username: config.username,
  password: config.password,
  host: config.host,
  port: config.port,
  dialect: 'postgres',
  logging: config.logging,
  ...(config.dialectOptions ? { dialectOptions: config.dialectOptions } : {}),
  models: [__dirname + '/../models'], // Path to models
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export default sequelize;
