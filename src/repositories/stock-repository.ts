import { Pool } from 'pg';
import { IStock } from '../models/interfaces';

export class StockRepository {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  /**
   * Encuentra un stock por su símbolo
   */
  async findBySymbol(symbol: string): Promise<IStock | null> {
    const result = await this.pool.query(
      'SELECT * FROM stocks WHERE symbol = $1',
      [symbol]
    );
    return result.rows[0] || null;
  }

  /**
   * Encuentra un stock por su ID
   */
  async findById(id: number): Promise<IStock | null> {
    const result = await this.pool.query(
      'SELECT * FROM stocks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista todos los stocks
   */
  async findAll(): Promise<IStock[]> {
    const result = await this.pool.query('SELECT * FROM stocks');
    return result.rows;
  }

  /**
   * Crea un nuevo stock
   */
  async create(stock: Omit<IStock, 'id'>): Promise<IStock> {
    const result = await this.pool.query(
      'INSERT INTO stocks (symbol, name, page_token) VALUES ($1, $2, $3) RETURNING *',
      [stock.symbol, stock.name, stock.page_token]
    );
    return result.rows[0];
  }

  /**
   * Actualiza un stock existente
   */
  async update(id: number, stock: Partial<Omit<IStock, 'id' | 'created_at' | 'updated_at'>>): Promise<IStock | null> {
    // Construir la consulta dinámicamente basada en los campos proporcionados
    const fields = Object.keys(stock);
    if (fields.length === 0) return this.findById(id);
    
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    const values = fields.map(field => stock[field as keyof typeof stock]);
    
    const query = `
      UPDATE stocks 
      SET ${setClause}, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = await this.pool.query<IStock>(query, [id, ...values]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualiza o crea un stock (upsert)
   */
  async upsert(stock: Omit<IStock, 'id' | 'created_at' | 'updated_at'>): Promise<IStock> {
    const result = await this.pool.query<IStock>(
      `INSERT INTO stocks (symbol, name, current_price, page_token, page_number, exchange, last_updated) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (symbol) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         current_price = EXCLUDED.current_price,
         page_token = EXCLUDED.page_token,
         page_number = EXCLUDED.page_number,
         exchange = EXCLUDED.exchange,
         last_updated = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [stock.symbol, stock.name, stock.current_price, stock.page_token, stock.page_number, stock.exchange]
    );
    
    return result.rows[0];
  }

  /**
   * Actualiza varios stocks en una sola transacción
   */
  async upsertMany(stocks: Array<Omit<IStock, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    if (stocks.length === 0) return;
    
    await this.pool.query('BEGIN');
    try {
      for (const stock of stocks) {
        const existingStock = await this.findBySymbol(stock.symbol);
        
        if (existingStock) {
          await this.pool.query(
            `UPDATE stocks 
             SET name = $1, current_price = $2, page_token = $3, page_number = $4, exchange = $5, 
                 last_updated = NOW(), updated_at = NOW() 
             WHERE symbol = $6`,
            [
              stock.name, 
              stock.current_price, 
              stock.page_token || null, 
              stock.page_number || null, 
              stock.exchange || null, 
              stock.symbol
            ]
          );
        } else {
          await this.pool.query(
            `INSERT INTO stocks (symbol, name, current_price, page_token, page_number, exchange, last_updated) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              stock.symbol, 
              stock.name, 
              stock.current_price, 
              stock.page_token || null, 
              stock.page_number || null, 
              stock.exchange || null
            ]
          );
        }
      }
      await this.pool.query('COMMIT');
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Busca stocks cuyo precio ha sido actualizado después de una fecha determinada
   */
  async findUpdatedAfter(date: Date): Promise<IStock[]> {
    const result = await this.pool.query<IStock>(
      'SELECT * FROM stocks WHERE last_updated > $1',
      [date]
    );
    
    return result.rows;
  }

  /**
   * Busca stocks por nombre o símbolo
   */
  async search(query: string): Promise<IStock[]> {
    const result = await this.pool.query<IStock>(
      `SELECT * FROM stocks 
       WHERE symbol ILIKE $1 OR name ILIKE $1`,
      [`%${query}%`]
    );
    
    return result.rows;
  }

  async updatePageToken(symbol: string, pageToken: string): Promise<void> {
    await this.pool.query(
      'UPDATE stocks SET page_token = $1 WHERE symbol = $2',
      [pageToken, symbol]
    );
  }
}
