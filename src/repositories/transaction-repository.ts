import { DatabaseService } from '../config/database';
import { ITransaction } from '../types/models/transaction';

export class TransactionRepository {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Creates a new transaction in the database.
   * @param transaction - Object with the new transaction data (without id, created_at, or updated_at).
   * @returns The created transaction with all its fields.
   */
  async create(transaction: Omit<ITransaction, 'id' | 'created_at' | 'updated_at'>): Promise<ITransaction> {
    // Asegurarse de que stock_symbol no sea null
    if (!transaction.stock_symbol) {
      transaction.stock_symbol = 'UNKNOWN';
    }
    
    try {
      // Primero intentamos con notes
      const query = `
        INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date, notes) 
        VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), $8) 
        RETURNING *
      `;
      
      const params = [
        transaction.portfolio_id,
        transaction.stock_symbol,
        transaction.type,
        transaction.quantity,
        transaction.price,
        transaction.status,
        transaction.date,
        transaction.notes || null
      ];
      
      const result = await this.dbService.query<ITransaction>(query, params);
      return result.rows[0];
    } catch (error) {
      // Si falla por la columna 'notes', intentamos sin ella
      console.log('Error al insertar transacción con notes, intentando sin notes:', error);
      
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
      
      if (transaction.notes) {
        console.log(`La razón del fallo no se almacenará en la BD: ${transaction.notes}`);
      }
      
      const fallbackResult = await this.dbService.query<ITransaction>(fallbackQuery, fallbackParams);
      return fallbackResult.rows[0];
    }
  }
}
