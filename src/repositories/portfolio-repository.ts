import { DatabaseService } from '../config/database';
import { IPortfolio} from '../types/models/portfolio';

export class PortfolioRepository {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Encuentra un portfolio por su ID
   */
  async findById(id: number): Promise<IPortfolio | null> {
    const result = await this.dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Lista todos los portfolios de un usuario
   */
  async findByUserId(userId: string): Promise<IPortfolio[]> {
    const result = await this.dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  }

  /**
   * Crea un nuevo portfolio
   */
  async create(portfolio: Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>): Promise<IPortfolio> {
    const result = await this.dbService.query<IPortfolio>(
      `INSERT INTO portfolios (user_id, name, description, total_value, total_profit_loss) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [portfolio.user_id, portfolio.name, portfolio.description, portfolio.total_value || 0, portfolio.total_profit_loss || 0]
    );
    return result.rows[0];
  }

  async update(id: number, portfolio: Partial<IPortfolio>): Promise<IPortfolio> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(portfolio).forEach(([key, value]) => {
      if (value !== undefined && !['id', 'created_at', 'updated_at'].includes(key)) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    values.push(id);
    const result = await this.dbService.query<IPortfolio>(
      `UPDATE portfolios 
       SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramCount} 
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async delete(id: number): Promise<void> {
    await this.dbService.query(
      'DELETE FROM portfolios WHERE id = $1',
      [id]
    );
  }

  /**
   * Obtiene el resumen de las acciones en un portfolio
   */
  async getPortfolioStockSummary(portfolioId: number): Promise<{
    symbol: string;
    quantity: number;
    total_cost: number;
  }[]> {
    const result = await this.dbService.query<{
      symbol: string;
      quantity: number;
      total_cost: number;
    }>(
      `WITH stock_summary AS (
        SELECT 
          stock_symbol as symbol,
          SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) as quantity,
          SUM(CASE WHEN type = 'BUY' THEN quantity * price ELSE -quantity * price END) as total_cost
        FROM transactions 
        WHERE portfolio_id = $1
        GROUP BY stock_symbol
        HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0
      )
      SELECT * FROM stock_summary`,
      [portfolioId]
    );
    return result.rows;
  }

  /**
   * Actualiza el valor total y el timestamp del portfolio
   */
  async updateValueAndTimestamp(id: number, totalValue: number): Promise<void> {
    await this.dbService.query(
      `UPDATE portfolios 
       SET total_value = $2,
           updated_at = NOW() 
       WHERE id = $1`,
      [id, totalValue]
    );
  }
}
