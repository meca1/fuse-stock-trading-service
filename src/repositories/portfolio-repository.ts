import { DatabaseService } from '../config/database';
import { IPortfolio} from '../types/models/portfolio';

export class PortfolioRepository {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Finds a portfolio by its unique ID.
   * @param id - The ID of the portfolio to find.
   * @returns The found portfolio or null if it does not exist.
   */
  async findById(id: number): Promise<IPortfolio | null> {
    const result = await this.dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Lists all portfolios associated with a user.
   * @param userId - The user ID who owns the portfolios.
   * @returns An array of portfolios belonging to the user.
   */
  async findByUserId(userId: string): Promise<IPortfolio[]> {
    const result = await this.dbService.query<IPortfolio>(
      'SELECT * FROM portfolios WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  }

  /**
   * Creates a new portfolio in the database.
   * @param portfolio - Object with the new portfolio data (without id, created_at, or updated_at).
   * @returns The created portfolio with all its fields.
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

  /**
   * Gets a summary of the stocks in a portfolio, including quantity and total cost per symbol.
   * Only includes stocks with a positive net quantity.
   * @param portfolioId - The ID of the portfolio to query.
   * @returns An array with the summary for each stock (symbol, quantity, total cost).
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
   * Updates the total value and the updated_at timestamp of a portfolio.
   * @param id - The ID of the portfolio to update.
   * @param totalValue - The new total value of the portfolio.
   * @returns void
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
