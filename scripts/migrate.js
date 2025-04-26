#!/usr/bin/env node

/**
 * Database migration script for production environment
 * Uses dbmate to run migrations against the RDS instance
 */

const { execSync } = require('child_process');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Construct database URL from environment variables
const constructDatabaseUrl = () => {
  const username = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'fuse_stock_trading_dev';
  
  return `postgres://${username}:${password}@${host}:${port}/${database}?sslmode=disable`;
};

// Main function to run migrations
const runMigrations = () => {
  try {
    console.log('Starting database migrations...');
    
    // Set the DATABASE_URL environment variable for dbmate
    process.env.DATABASE_URL = constructDatabaseUrl();
    
    // Run dbmate up command to apply all pending migrations
    console.log(`Using database URL: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);
    execSync('dbmate up', { stdio: 'inherit' });
    
    console.log('✅ Database migrations completed successfully.');
    return 0;
  } catch (error) {
    console.error('❌ Error running database migrations:', error.message);
    return 1;
  }
};

// Execute if this file is called directly
if (require.main === module) {
  const exitCode = runMigrations();
  process.exit(exitCode);
}

module.exports = { runMigrations };
