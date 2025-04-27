import { DatabaseService } from '../config/database';
import { ITransaction } from '../types/models/transaction';

export class TransactionRepository {
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
}
