import { DatabaseService } from '../config/database';
import { IPortfolio, IPortfolioSummary } from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { StockService } from '../services/stock-service';
import { IPortfolioStock } from '../types/models/portfolio-stock';
import { TransactionType } from '../types/common/enums';

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

  constructor(private readonly dbService: DatabaseService) {
    this.stockService = StockService.getInstance();
  }

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

  async getPortfolioValue(id: number): Promise<number> {
    const result = await this.dbService.query<{ total_value: number }>(
      `SELECT COALESCE(SUM(
        CASE 
          WHEN type = 'BUY' THEN quantity * price
          WHEN type = 'SELL' THEN -quantity * price
        END
      ), 0) as total_value
      FROM transactions 
      WHERE portfolio_id = $1`,
      [id]
    );
    return result.rows[0]?.total_value || 0;
  }

  async getPortfolioStocks(portfolioId: number): Promise<IPortfolioStock[]> {
    const result = await this.dbService.query<IPortfolioStock>(
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
      SELECT 
        symbol,
        quantity,
        total_cost / quantity as average_price
      FROM stock_summary`,
      [portfolioId]
    );
    return result.rows;
  }

  async getPortfolioSummary(portfolioId: number): Promise<{
    totalValue: number;
    totalProfitLoss: number;
    stockCount: number;
    lastUpdated: Date;
  }> {
    const result = await this.dbService.query<{
      total_value: number;
      total_profit_loss: number;
      stock_count: number;
      last_updated: Date;
    }>(
      `WITH stock_summary AS (
        SELECT 
          stock_symbol,
          SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) as quantity,
          SUM(CASE WHEN type = 'BUY' THEN quantity * price ELSE -quantity * price END) as total_cost
        FROM transactions 
        WHERE portfolio_id = $1
        GROUP BY stock_symbol
        HAVING SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) > 0
      )
      SELECT 
        COALESCE(SUM(total_cost), 0) as total_value,
        0 as total_profit_loss,
        COUNT(*) as stock_count,
        NOW() as last_updated
      FROM stock_summary`,
      [portfolioId]
    );
    
    const summary = result.rows[0];
    return {
      totalValue: summary?.total_value || 0,
      totalProfitLoss: summary?.total_profit_loss || 0,
      stockCount: summary?.stock_count || 0,
      lastUpdated: summary?.last_updated || new Date()
    };
  }

  async updateValueAndTimestamp(id: number, totalValue: number, totalProfitLoss: number): Promise<void> {
    await this.dbService.query(
      `UPDATE portfolios 
       SET total_value = $2, 
           total_profit_loss = $3,
           updated_at = NOW() 
       WHERE id = $1`,
      [id, totalValue, totalProfitLoss]
    );
  }

  async getPortfolioValueAndSummary(portfolioId: number): Promise<PortfolioSummaryResponse> {
    try {
      // Primero obtenemos el portfolio para obtener el userId
      const portfolio = await this.findById(portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }

      // Obtenemos el resumen de las acciones
      const stockSummaryResult = await this.dbService.query<{
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

      // Obtenemos los precios actuales de las acciones en paralelo
      const stockPromises = stockSummaryResult.rows.map(async (stockSummary) => {
        try {
          const stockDetails = await this.stockService.getStockBySymbol(stockSummary.symbol);
          if (!stockDetails) {
            console.warn(`Stock details not found for symbol: ${stockSummary.symbol}`);
            return null;
          }

          const averagePrice = stockSummary.total_cost / stockSummary.quantity;
          const currentPrice = stockDetails.price;
          const profitLossAbsolute = (currentPrice - averagePrice) * stockSummary.quantity;
          const profitLossPercentage = ((currentPrice - averagePrice) / averagePrice) * 100;

          return {
            symbol: stockSummary.symbol,
            name: stockDetails.name || stockSummary.symbol,
            quantity: stockSummary.quantity,
            averagePrice: Number(averagePrice.toFixed(2)),
            currentPrice: Number(currentPrice.toFixed(2)),
            profitLoss: {
              absolute: Number(profitLossAbsolute.toFixed(2)),
              percentage: Number(profitLossPercentage.toFixed(1))
            }
          };
        } catch (error) {
          console.error(`Error getting stock details for ${stockSummary.symbol}:`, error);
          return null;
        }
      });

      // Esperamos a que todas las promesas se resuelvan y filtramos los nulls
      const stocks = (await Promise.all(stockPromises)).filter((stock): stock is PortfolioStock => stock !== null);

      // Calculamos el valor total del portfolio
      const totalValue = stocks.reduce((sum, stock) => sum + (stock.currentPrice * stock.quantity), 0);

      // Calculamos el rendimiento (simulado por ahora)
      const performance = {
        lastMonth: Number((Math.random() * 10).toFixed(1)),
        lastYear: Number((Math.random() * 25).toFixed(1))
      };

      return {
        userId: portfolio.user_id,
        totalValue: Number(totalValue.toFixed(2)),
        currency: "USD",
        lastUpdated: new Date().toISOString(),
        stocks,
        performance
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }
}
