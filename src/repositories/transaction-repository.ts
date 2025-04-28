import { DatabaseService } from '../config/database';
import { ITransaction } from '../types/models/transaction';
import { TransactionStatus } from '../types/common/enums';

export class TransactionRepository {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Creates a new transaction in the database.
   * @param transaction - Object with the new transaction data (without id, created_at, or updated_at).
   * @returns The created transaction with all its fields.
   */
  async create(transaction: Partial<ITransaction>): Promise<ITransaction> {
    let hasNotesColumn = true;
    
    try {
      // Check if the 'notes' column exists in the 'transactions' table
      try {
        await this.dbService.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'transactions' AND column_name = 'notes'
        `);
        console.log('Notes column exists in the transactions table, including it in the query');
      } catch (error) {
        hasNotesColumn = false;
        console.log('Notes column does NOT exist in the transactions table, it will be omitted');
      }

      // If the status is FAILED and we have notes but the column doesn't exist
      if (transaction.status === TransactionStatus.FAILED && transaction.notes && !hasNotesColumn) {
        console.log(`Failure reason (not stored in DB): ${transaction.notes}`);
      }

      // Build the query dynamically based on whether the notes column exists
      let query;
      let params;
      
      if (hasNotesColumn) {
        console.log('Notes column exists in the transactions table, including it in the query');
        query = `
          INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date, notes) 
          VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8) 
          RETURNING *
        `;
        
        params = [
          transaction.portfolio_id,
          transaction.stock_symbol,
          transaction.type,
          transaction.quantity,
          transaction.price,
          transaction.status,
          transaction.date,
          transaction.notes || null
        ];
      } else {
        console.log('Notes column does NOT exist in the transactions table, it will be omitted');
        query = `
          INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date) 
          VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW())) 
          RETURNING *
        `;
        
        params = [
          transaction.portfolio_id,
          transaction.stock_symbol,
          transaction.type,
          transaction.quantity,
          transaction.price,
          transaction.status,
          transaction.date
        ];
        
        if (transaction.notes) {
          console.log(`Failure reason (not stored in DB): ${transaction.notes}`);
        }
      }
      
      console.log(`Executing query to insert transaction: ${query}`);
      
      const result = await this.dbService.query<ITransaction>(query, params);
      console.log(`Transaction successfully inserted with id: ${result.rows[0]?.id}`);
      
      return result.rows[0];
    } catch (error: any) {
      console.error('Error inserting transaction:', error);
      
      // If the error is related to the 'notes' column, try inserting without it
      if (hasNotesColumn && transaction.notes && error.toString().includes('notes')) {
        console.log('Error with notes column, trying to insert without this column');
        
        try {
          // Fallback query without notes
          const fallbackQuery = `
            INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date) 
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW())) 
            RETURNING *
          `;
          
          const fallbackParams = [
            transaction.portfolio_id,
            transaction.stock_symbol,
            transaction.type,
            transaction.quantity,
            transaction.price,
            transaction.status,
            transaction.date
          ];
          
          const fallbackResult = await this.dbService.query<ITransaction>(fallbackQuery, fallbackParams);
          return fallbackResult.rows[0];
        } catch (fallbackError) {
          console.error('Error in fallback attempt:', fallbackError);
          throw fallbackError;
        }
      }
      
      // If status is FAILED and we have notes but the column doesn't exist
      if (transaction.status === TransactionStatus.FAILED && transaction.notes) {
        console.log(`Failure reason will not be stored in DB: ${transaction.notes}`);
      }
      
      throw error;
    }
  }

  /**
   * Busca transacciones por fecha
   * @param date Fecha en formato YYYY-MM-DD
   * @returns Lista de transacciones
   */
  async findByDate(date: string): Promise<ITransaction[]> {
    try {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      console.log(`Searching for transactions between ${startDate.toISOString()} and ${endDate.toISOString()}`);
      
      const result = await this.dbService.query<ITransaction>(`
        SELECT * FROM transactions 
        WHERE date BETWEEN $1 AND $2
        ORDER BY date DESC
      `, [startDate, endDate]);
      
      console.log(`Found ${result.rows.length} transactions for date ${date}`);
      
      return result.rows;
    } catch (error) {
      console.error(`Error searching for transactions by date ${date}:`, error);
      throw error;
    }
  }
}
