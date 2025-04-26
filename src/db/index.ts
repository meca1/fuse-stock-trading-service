import { QueryResult, QueryResultRow } from 'pg';
import pool from '../config/database';

/**
 * Executes a SQL query with parameters
 * @param text SQL query text
 * @param params Query parameters
 * @returns Promise with query result
 */
export const query = async <T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  
  return res;
};

/**
 * Gets a client from the pool
 * @returns A client from the pool
 */
export const getClient = async () => {
  const client = await pool.connect();
  const originalRelease = client.release;
  
  // Monkey patch the release method to log query execution time
  client.release = () => {
    client.release = originalRelease;
    return client.release();
  };
  
  return client;
};

/**
 * Executes a transaction with the provided callback
 * @param callback Function to execute within transaction
 * @returns Result of the callback
 */
export const transaction = async <T>(callback: (client: any) => Promise<T>): Promise<T> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export default {
  query,
  getClient,
  transaction,
  pool
};
