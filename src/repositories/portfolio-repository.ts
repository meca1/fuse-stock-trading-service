import pool from '../config/database';
import { IPortfolio, ITransaction } from '../models/interfaces';

export class PortfolioRepository {
  /**
   * Encuentra un portfolio por su ID
   */
  async findById(id: number): Promise<IPortfolio | null> {
    const result = await pool.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Lista todos los portfolios de un usuario
   */
  async findByUserId(userId: number): Promise<IPortfolio[]> {
    const result = await pool.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE user_id = $1',
      [userId]
    );
    
    return result.rows;
  }

  /**
   * Crea un nuevo portfolio
   */
  async create(portfolio: Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>): Promise<IPortfolio> {
    const result = await pool.query<IPortfolio>(
      `INSERT INTO portfolios (name, user_id) 
       VALUES ($1, $2) 
       RETURNING *`,
      [portfolio.name, portfolio.user_id]
    );
    
    return result.rows[0];
  }

  /**
   * Actualiza un portfolio existente
   */
  async update(id: number, portfolio: Partial<Omit<IPortfolio, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<IPortfolio | null> {
    const keys = Object.keys(portfolio);
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = Object.values(portfolio);

    const query = `
      UPDATE portfolios 
      SET ${setClauses.join(', ')}, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;

    const result = await pool.query<IPortfolio>(query, [id, ...values]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Elimina un portfolio
   */
  async delete(id: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM portfolios WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Obtiene todas las transacciones de un portfolio
   */
  async getTransactions(portfolioId: number): Promise<ITransaction[]> {
    const result = await pool.query<ITransaction>(
      `SELECT t.*, s.symbol, s.name as stock_name, s.current_price 
       FROM transactions t
       JOIN stocks s ON t.stock_id = s.id
       WHERE t.portfolio_id = $1
       ORDER BY t.date DESC`,
      [portfolioId]
    );
    
    return result.rows;
  }

  /**
   * Obtiene un resumen del portfolio con el valor actual de las acciones
   */
  async getPortfolioSummary(portfolioId: number): Promise<any> {
    const client = await pool.connect();
    
    try {
      // Obtener información básica del portfolio
      const portfolioResult = await client.query<IPortfolio>(
        'SELECT * FROM portfolios WHERE id = $1',
        [portfolioId]
      );
      
      if (portfolioResult.rows.length === 0) {
        return null;
      }
      
      const portfolio = portfolioResult.rows[0];
      
      // Obtener resumen de las acciones en el portfolio
      const stocksResult = await client.query(
        `SELECT 
          s.id,
          s.symbol,
          s.name,
          s.current_price,
          SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) as quantity,
          SUM(CASE WHEN t.type = 'BUY' THEN t.quantity * t.price ELSE -t.quantity * t.price END) as cost_basis,
          SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) * s.current_price as current_value
        FROM transactions t
        JOIN stocks s ON t.stock_id = s.id
        WHERE t.portfolio_id = $1
        GROUP BY s.id, s.symbol, s.name, s.current_price
        HAVING SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) > 0`,
        [portfolioId]
      );
      
      // Calcular valor total del portfolio
      const totalValue = stocksResult.rows.reduce((sum, stock) => sum + parseFloat(stock.current_value), 0);
      
      return {
        id: portfolio.id,
        name: portfolio.name,
        user_id: portfolio.user_id,
        created_at: portfolio.created_at,
        updated_at: portfolio.updated_at,
        stocks: stocksResult.rows,
        total_value: totalValue
      };
    } finally {
      client.release();
    }
  }
}
