import { DatabaseService } from '../config/database';
import { IPortfolio, ITransaction, IPortfolioSummary } from '../models/interfaces';
import { StockService } from '../services/stock-service';

interface PortfolioStock {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  profitLoss: {
    absolute: number;
    percentage: number;
  };
}

interface PortfolioSummaryResponse {
  userId: string;
  totalValue: number;
  currency: string;
  lastUpdated: string;
  stocks: PortfolioStock[];
  performance: {
    lastMonth: number;
    lastYear: number;
  };
}

export class PortfolioRepository {
  private stockService: StockService;

  constructor() {
    this.stockService = StockService.getInstance();
  }

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
   * Obtiene el resumen detallado del portafolio
   */
  async getPortfolioValueAndSummary(portfolioId: string): Promise<PortfolioSummaryResponse> {
    const dbService = await DatabaseService.getInstance();
    const client = await dbService.getClient();

    try {
      // Obtenemos el portfolio para obtener el user_id
      const portfolioResult = await client.query<IPortfolio>(
        'SELECT * FROM portfolios WHERE id = $1',
        [portfolioId]
      );

      if (portfolioResult.rows.length === 0) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }

      const portfolio = portfolioResult.rows[0];

      // Obtenemos las transacciones agrupadas por stock
      const result = await client.query<{ 
        stock_symbol: string; 
        quantity: number;
        total_cost: number;
      }>(
        `SELECT 
          t.stock_symbol,
          SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) as quantity,
          SUM(CASE WHEN t.type = 'BUY' THEN t.quantity * t.price ELSE -t.quantity * t.price END) as total_cost
        FROM transactions t
        WHERE t.portfolio_id = $1 AND t.status = 'COMPLETED'
        GROUP BY t.stock_symbol
        HAVING SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) > 0`,
        [portfolioId]
      );

      // Obtenemos los detalles actuales de cada stock
      const stocks = await Promise.all(
        result.rows.map(async (row) => {
          const stock = await this.stockService.getStockBySymbol(row.stock_symbol);
          const currentPrice = stock?.price || 0;
          const averagePrice = row.total_cost / row.quantity;
          const profitLossAbs = (currentPrice - averagePrice) * row.quantity;
          const profitLossPerc = ((currentPrice - averagePrice) / averagePrice) * 100;

          return {
            symbol: row.stock_symbol,
            name: stock?.name || row.stock_symbol,
            quantity: row.quantity,
            averagePrice: Number(averagePrice.toFixed(2)),
            currentPrice: Number(currentPrice.toFixed(2)),
            profitLoss: {
              absolute: Number(profitLossAbs.toFixed(2)),
              percentage: Number(profitLossPerc.toFixed(1))
            }
          };
        })
      );

      // Calculamos el valor total
      const totalValue = stocks.reduce((sum, stock) => 
        sum + (stock.currentPrice * stock.quantity), 0
      );

      // Por ahora, usamos valores simulados para el rendimiento
      // TODO: Implementar cálculo real de rendimiento
      const performance = {
        lastMonth: 0,
        lastYear: 0
      };

      return {
        userId: portfolio.user_id.toString(),
        totalValue: Number(totalValue.toFixed(2)),
        currency: "USD",
        lastUpdated: new Date().toISOString(),
        stocks: stocks.sort((a, b) => b.profitLoss.absolute - a.profitLoss.absolute),
        performance
      };
    } finally {
      client.release();
    }
  }
}
