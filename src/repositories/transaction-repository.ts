import { DatabaseService } from '../config/database';
import { ITransaction } from '../types/models/transaction';

export class TransactionRepository {
  /**
   * Lista todas las transacciones de un portfolio
   */
  async findByPortfolioId(portfolioId: number): Promise<ITransaction[]> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<ITransaction>(
      'SELECT * FROM transactions WHERE portfolio_id = $1 ORDER BY date DESC',
      [portfolioId]
    );
    
    return result.rows;
  }

  /**
   * Crea una nueva transacción
   */
  async create(transaction: Omit<ITransaction, 'id' | 'created_at' | 'updated_at'>): Promise<ITransaction> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<ITransaction>(
      `INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date) 
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW())) 
       RETURNING *`,
      [
        transaction.portfolio_id,
        transaction.stock_symbol,
        transaction.type,
        transaction.quantity,
        transaction.price,
        transaction.status,
        transaction.date
      ]
    );
    
    return result.rows[0];
  }

  /**
   * Crea múltiples transacciones en una sola operación
   */
  async createMany(transactions: Omit<ITransaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<ITransaction[]> {
    const dbService = await DatabaseService.getInstance();
    const client = await dbService.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Build the batch insert query
      const values = transactions.map((t, i) => {
        const offset = i * 7;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, COALESCE($${offset + 7}, NOW()))`;
      }).join(',');
      
      const params = transactions.flatMap(t => [
        t.portfolio_id,
        t.stock_symbol,
        t.type,
        t.quantity,
        t.price,
        t.status,
        t.date
      ]);
      
      const result = await client.query<ITransaction>(
        `INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date) 
         VALUES ${values}
         RETURNING *`,
        params
      );
      
      await client.query('COMMIT');
      return result.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene el total de acciones de un stock en un portfolio
   */
  async getStockQuantityInPortfolio(portfolioId: number, symbol: string): Promise<number> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<{ total_quantity: string }>(
      `SELECT 
        SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) as total_quantity
       FROM transactions
       WHERE portfolio_id = $1 AND stock_symbol = $2`,
      [portfolioId, symbol]
    );
    
    return result.rows.length > 0 && result.rows[0].total_quantity 
      ? parseInt(result.rows[0].total_quantity, 10) 
      : 0;
  }
}
