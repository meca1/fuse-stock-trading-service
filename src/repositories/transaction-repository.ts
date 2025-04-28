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
      // Al principio intentamos verificar si la columna notes existe
      const columnCheckQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'notes'
      `;
      
      const columnCheck = await this.dbService.query(columnCheckQuery);
      const notesColumnExists = columnCheck.rows.length > 0;
      
      let query;
      let params;
      
      if (notesColumnExists) {
        console.log('La columna notes existe en la tabla transactions, incluyéndola en la consulta');
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
        console.log('La columna notes NO existe en la tabla transactions, se omitirá');
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
          console.log(`Razón del fallo (no almacenada en BD): ${transaction.notes}`);
        }
      }
      
      console.log(`Ejecutando consulta para insertar transacción: ${query}`);
      const result = await this.dbService.query<ITransaction>(query, params);
      console.log(`Transacción insertada correctamente con id: ${result.rows[0]?.id}`);
      return result.rows[0];
    } catch (error) {
      console.error('Error al insertar transacción:', error);
      
      // Si hay error con la columna notes, intentamos sin ella
      if (error instanceof Error && error.message.includes('column "notes"')) {
        console.log('Error con la columna notes, intentando insertar sin esta columna');
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
        
        try {
          const fallbackResult = await this.dbService.query<ITransaction>(fallbackQuery, fallbackParams);
          return fallbackResult.rows[0];
        } catch (fallbackError) {
          console.error('Error en el intento de fallback:', fallbackError);
          throw fallbackError;
        }
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
      const startDate = new Date(`${date}T00:00:00Z`);
      const endDate = new Date(`${date}T23:59:59Z`);
      
      const query = `
        SELECT * FROM transactions 
        WHERE date BETWEEN $1 AND $2
        ORDER BY date DESC
      `;
      
      console.log(`Buscando transacciones entre ${startDate.toISOString()} y ${endDate.toISOString()}`);
      const result = await this.dbService.query<ITransaction>(query, [startDate.toISOString(), endDate.toISOString()]);
      
      console.log(`Se encontraron ${result.rows.length} transacciones para la fecha ${date}`);
      return result.rows;
    } catch (error) {
      console.error(`Error al buscar transacciones por fecha ${date}:`, error);
      throw error;
    }
  }
}
