import { DatabaseService } from '../config/database';
import { ITransaction } from '../models/interfaces';

export class TransactionRepository {
  /**
   * Encuentra una transacción por su ID
   */
  async findById(id: number): Promise<ITransaction | null> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<ITransaction>(
      'SELECT * FROM transactions WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

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
   * Lista todas las transacciones de un stock
   */
  async findByStockSymbol(symbol: string): Promise<ITransaction[]> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<ITransaction>(
      'SELECT * FROM transactions WHERE stock_symbol = $1 ORDER BY date DESC',
      [symbol]
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
      
      const results: ITransaction[] = [];
      
      for (const transaction of transactions) {
        const result = await client.query<ITransaction>(
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
        
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return results;
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

  /**
   * Obtiene el costo promedio de un stock en un portfolio
   */
  async getAverageCostInPortfolio(portfolioId: number, symbol: string): Promise<number> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<{ avg_cost: string }>(
      `SELECT 
        CASE 
          WHEN SUM(CASE WHEN type = 'BUY' THEN quantity ELSE 0 END) = 0 THEN 0
          ELSE SUM(CASE WHEN type = 'BUY' THEN quantity * price ELSE 0 END) / 
               SUM(CASE WHEN type = 'BUY' THEN quantity ELSE 0 END)
        END as avg_cost
       FROM transactions
       WHERE portfolio_id = $1 AND stock_symbol = $2`,
      [portfolioId, symbol]
    );
    
    return result.rows.length > 0 && result.rows[0].avg_cost 
      ? parseFloat(result.rows[0].avg_cost) 
      : 0;
  }
}
