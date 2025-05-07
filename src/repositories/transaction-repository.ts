import { DatabaseService } from '../config/database';
import { ITransaction } from '../types/models/transaction';
import { TransactionRepositoryError } from '../utils/errors/repository-error';

/**
 * Repository for transaction-related database operations
 */
export class TransactionRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Creates and initializes a new instance of TransactionRepository
   * @returns Promise with initialized TransactionRepository instance
   */
  public static async initialize(): Promise<TransactionRepository> {
    const dbService = await DatabaseService.getInstance();
    return new TransactionRepository(dbService);
  }

  /**
   * Creates a new transaction
   */
  async create(
    transaction: Omit<ITransaction, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<ITransaction> {
    try {
      const result = await this.db.query(
        `INSERT INTO transactions 
        (portfolio_id, stock_symbol, type, quantity, price, status, notes, date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        RETURNING *`,
        [
          transaction.portfolio_id,
          transaction.stock_symbol,
          transaction.type,
          transaction.quantity,
          transaction.price,
          transaction.status,
          transaction.notes,
          transaction.date,
        ],
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  /**
   * Finds transactions by date
   */
  async findByDate(date: string): Promise<ITransaction[]> {
    try {
      const result = await this.db.query('SELECT * FROM transactions WHERE DATE(date) = DATE($1)', [
        date,
      ]);
      return result.rows;
    } catch (error) {
      console.error('Error finding transactions by date:', error);
      throw error;
    }
  }

  /**
   * Finds transactions by portfolio ID
   */
  async findByPortfolioId(portfolioId: string): Promise<ITransaction[]> {
    try {
      const result = await this.db.query('SELECT * FROM transactions WHERE portfolio_id = $1', [
        portfolioId,
      ]);
      return result.rows;
    } catch (error) {
      console.error('Error finding transactions by portfolio ID:', error);
      throw error;
    }
  }
}
