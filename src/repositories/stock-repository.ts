import pool from '../config/database';
import { IStock } from '../models/interfaces';

export class StockRepository {
  /**
   * Encuentra un stock por su símbolo
   */
  async findBySymbol(symbol: string): Promise<IStock | null> {
    const result = await pool.query<IStock>(
      'SELECT * FROM stocks WHERE symbol = $1',
      [symbol]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Encuentra un stock por su ID
   */
  async findById(id: number): Promise<IStock | null> {
    const result = await pool.query<IStock>(
      'SELECT * FROM stocks WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Lista todos los stocks
   */
  async findAll(): Promise<IStock[]> {
    const result = await pool.query<IStock>('SELECT * FROM stocks');
    return result.rows;
  }

  /**
   * Crea un nuevo stock
   */
  async create(stock: Omit<IStock, 'id' | 'created_at' | 'updated_at'>): Promise<IStock> {
    const result = await pool.query<IStock>(
      `INSERT INTO stocks (symbol, name, current_price, last_updated) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING *`,
      [stock.symbol, stock.name, stock.current_price]
    );
    
    return result.rows[0];
  }

  /**
   * Actualiza un stock existente
   */
  async update(symbol: string, stock: Partial<Omit<IStock, 'id' | 'symbol' | 'created_at' | 'updated_at'>>): Promise<IStock | null> {
    const keys = Object.keys(stock);
    if (keys.length === 0) return this.findBySymbol(symbol);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = Object.values(stock);

    const query = `
      UPDATE stocks 
      SET ${setClauses.join(', ')}, updated_at = NOW() 
      WHERE symbol = $1 
      RETURNING *
    `;

    const result = await pool.query<IStock>(query, [symbol, ...values]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualiza o crea un stock (upsert)
   */
  async upsert(stock: Omit<IStock, 'id' | 'created_at' | 'updated_at'>): Promise<IStock> {
    const result = await pool.query<IStock>(
      `INSERT INTO stocks (symbol, name, current_price, last_updated) 
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (symbol) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         current_price = EXCLUDED.current_price,
         last_updated = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [stock.symbol, stock.name, stock.current_price]
    );
    
    return result.rows[0];
  }

  /**
   * Actualiza varios stocks en una sola transacción
   */
  async upsertMany(stocks: Omit<IStock, 'id' | 'created_at' | 'updated_at'>[]): Promise<IStock[]> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const results: IStock[] = [];
      
      for (const stock of stocks) {
        const result = await client.query<IStock>(
          `INSERT INTO stocks (symbol, name, current_price, last_updated) 
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (symbol) 
           DO UPDATE SET 
             name = EXCLUDED.name,
             current_price = EXCLUDED.current_price,
             last_updated = NOW(),
             updated_at = NOW()
           RETURNING *`,
          [stock.symbol, stock.name, stock.current_price]
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
   * Busca stocks cuyo precio ha sido actualizado después de una fecha determinada
   */
  async findUpdatedAfter(date: Date): Promise<IStock[]> {
    const result = await pool.query<IStock>(
      'SELECT * FROM stocks WHERE last_updated > $1',
      [date]
    );
    
    return result.rows;
  }

  /**
   * Busca stocks por nombre o símbolo
   */
  async search(query: string): Promise<IStock[]> {
    const result = await pool.query<IStock>(
      `SELECT * FROM stocks 
       WHERE symbol ILIKE $1 OR name ILIKE $1`,
      [`%${query}%`]
    );
    
    return result.rows;
  }
}
