import { DatabaseService } from '../config/database';
import { IPortfolio, ITransaction } from '../models/interfaces';

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
   * Obtiene el valor total de un portfolio
   */
  async getPortfolioValue(portfolioId: number): Promise<number> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query<{ total_value: string }>(
      `SELECT SUM(t.quantity * s.current_price) as total_value 
       FROM transactions t 
       JOIN stocks s ON t.stock_id = s.id 
       WHERE t.portfolio_id = $1 AND t.type = 'BUY'`,
      [portfolioId]
    );
    
    return parseFloat(result.rows[0]?.total_value || '0');
  }

  /**
   * Obtiene las acciones de un portfolio
   */
  async getPortfolioStocks(portfolioId: number): Promise<any[]> {
    const dbService = await DatabaseService.getInstance();
    const result = await dbService.query(
      `SELECT 
         s.id, 
         s.symbol, 
         s.name, 
         s.current_price, 
         SUM(t.quantity) as total_quantity, 
         SUM(t.quantity * t.price) / SUM(t.quantity) as avg_price,
         SUM(t.quantity * s.current_price) as current_value,
         SUM(t.quantity * s.current_price) - SUM(t.quantity * t.price) as profit_loss
       FROM transactions t 
       JOIN stocks s ON t.stock_id = s.id 
       WHERE t.portfolio_id = $1 AND t.type = 'BUY'
       GROUP BY s.id, s.symbol, s.name, s.current_price
       HAVING SUM(t.quantity) > 0
       ORDER BY s.symbol`,
      [portfolioId]
    );
    
    return result.rows.map((stock: any) => ({
      ...stock,
      avg_price: parseFloat(stock.avg_price),
      current_value: parseFloat(stock.current_value),
      profit_loss: parseFloat(stock.profit_loss),
      profit_loss_percent: (parseFloat(stock.profit_loss) / (parseFloat(stock.avg_price) * parseInt(stock.total_quantity))) * 100
    }));
  }

  /**
   * Obtiene un resumen del portfolio con el valor actual de las acciones
   */
  async getPortfolioSummary(portfolioId: number): Promise<any> {
    const dbService = await DatabaseService.getInstance();
    const client = await dbService.getClient();
    
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
      
      // Obtener valor total del portfolio
      const portfolioValue = await this.getPortfolioValue(portfolioId);
      
      // Obtener acciones del portfolio
      const portfolioStocks = await this.getPortfolioStocks(portfolioId);
      
      return {
        id: portfolio.id,
        name: portfolio.name,
        user_id: portfolio.user_id,
        created_at: portfolio.created_at,
        updated_at: portfolio.updated_at,
        stocks: portfolioStocks,
        total_value: portfolioValue
      };
    } finally {
      client.release();
    }
  }
}
