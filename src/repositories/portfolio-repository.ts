import { DatabaseService } from '../config/database';
import { IPortfolio, ITransaction, IPortfolioSummary } from '../models/interfaces';

export class PortfolioRepository {
  /**
   * Encuentra un portfolio por su ID
   */
  async findById(id: number): Promise<IPortfolio | null> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Lista todos los portfolios de un usuario
   */
  async findByUserId(userId: number): Promise<IPortfolio[]> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE user_id = $1',
      [userId]
    );
    
    return result.rows;
  }

  /**
   * Crea un nuevo portfolio
   */
  async create(portfolio: Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>): Promise<IPortfolio> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<IPortfolio>(
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

    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<IPortfolio>(query, [id, ...values]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Elimina un portfolio
   */
  async delete(id: number): Promise<boolean> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query(
      'DELETE FROM portfolios WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Actualiza el valor total y la fecha de actualización del portafolio
   */
  async updateValueAndTimestamp(portfolioId: number, totalValue: number): Promise<void> {
    const dbService = await DatabaseService.getInstance();
    await dbService.query(
      'UPDATE portfolios SET total_value = $1, last_updated = NOW() WHERE id = $2',
      [totalValue, portfolioId]
    );
  }

  /**
   * Obtiene el valor total y el resumen del portafolio
   */
  async getPortfolioValueAndSummary(portfolioId: string): Promise<{ value: number; summary: IPortfolioSummary[] }> {
    const dbService = await DatabaseService.getInstance();
    const client = await dbService.getClient();

    try {
      const result = await client.query<IPortfolioSummary & { total_value: number }>(
        `WITH portfolio_summary AS (
          SELECT 
            t.stock_symbol,
            s.current_price,
            SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) as quantity,
            SUM(CASE WHEN t.type = 'BUY' THEN t.quantity * t.price ELSE -t.quantity * t.price END) as total_cost
          FROM transactions t
          LEFT JOIN stocks s ON t.stock_symbol = s.symbol
          WHERE t.portfolio_id = $1 AND t.status = 'COMPLETED'
          GROUP BY t.stock_symbol, s.current_price
          HAVING SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) > 0
        )
        SELECT 
          stock_symbol,
          quantity,
          current_price,
          total_cost,
          (quantity * current_price) as current_value,
          ((quantity * current_price) - total_cost) as profit_loss,
          SUM(quantity * current_price) OVER () as total_value
        FROM portfolio_summary
        ORDER BY current_value DESC`,
        [portfolioId]
      );

      if (result.rows.length === 0) {
        return { value: 0, summary: [] };
      }

      const totalValue = result.rows[0].total_value;
      const summary = result.rows.map(({ total_value, ...row }) => row);

      return { value: totalValue, summary };
    } finally {
      client.release();
    }
  }
}
