import { DatabaseService } from '../config/database';
import { IPortfolio, PortfolioStock } from '../types/models/portfolio';

/**
 * Repository for portfolio-related database operations
 */
export class PortfolioRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Finds a portfolio by its ID
   */
  async findById(id: string): Promise<IPortfolio | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM portfolios WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding portfolio by ID:', error);
      throw error;
    }
  }

  /**
   * Finds all portfolios for a user
   */
  async findByUserId(userId: string): Promise<IPortfolio[]> {
    try {
      const result = await this.db.query(
        'SELECT * FROM portfolios WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding portfolios by user ID:', error);
      throw error;
    }
  }

  /**
   * Creates a new portfolio
   */
  async create(portfolio: Omit<IPortfolio, 'id' | 'created_at' | 'updated_at'>): Promise<IPortfolio> {
    try {
      const result = await this.db.query(
        'INSERT INTO portfolios (user_id, name) VALUES ($1, $2) RETURNING *',
        [portfolio.user_id, portfolio.name]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating portfolio:', error);
      throw error;
    }
  }

  /**
   * Gets a summary of stocks in a portfolio
   */
  async getPortfolioStockSummary(portfolioId: string): Promise<PortfolioStock[]> {
    try {
      const result = await this.db.query(`
        SELECT 
          stock_symbol as symbol,
          SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) as quantity,
          SUM(CASE WHEN type = 'BUY' THEN quantity * price ELSE -quantity * price END) as total_cost
        FROM transactions 
        WHERE portfolio_id = $1 AND status = 'COMPLETED'
        GROUP BY stock_symbol
        HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0
      `, [portfolioId]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting portfolio stock summary:', error);
      throw error;
    }
  }

  /**
   * Updates the total value and timestamp of a portfolio
   */
  async updateValueAndTimestamp(id: string, value: number): Promise<void> {
    try {
      await this.db.query(
        'UPDATE portfolios SET total_value = $1, updated_at = NOW() WHERE id = $2',
        [value, id]
      );
    } catch (error) {
      console.error('Error updating portfolio value:', error);
      throw error;
    }
  }
}
