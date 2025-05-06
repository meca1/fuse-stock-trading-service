export interface IPortfolioStock {
  id: number;
  portfolio_id: number;
  stock_id: number;
  quantity: number;
  average_price: number;
  symbol: string;
  name: string;
  current_price: number;
  exchange: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Interface for portfolio data
 */
export interface IPortfolio {
  id: string;
  user_id: string;
  name: string;
  total_value?: number;
  created_at?: string;
  updated_at?: string;
}

export interface IPortfolioSummary {
  stock_symbol: string;
  quantity: number;
  current_price: number;
  total_cost: number;
  current_value: number;
  profit_loss: number;
}

/**
 * Interface for portfolio stock summary
 */
export interface PortfolioStock {
  symbol: string;
  quantity: number;
  total_cost: number;
}

/**
 * Interface for portfolio summary response
 */
export interface PortfolioSummaryResponse {
  userId: string;
  totalValue: number;
  currency: string;
  lastUpdated: string;
  stocks: {
    symbol: string;
    name: string;
    quantity: number;
    currentPrice: number;
    profitLoss: {
      absolute: number;
      percentage: number;
    };
  }[];
}

/**
 * Interface for cached portfolio summary data
 */
export interface CachedPortfolioSummary {
  data: PortfolioSummaryResponse;
  timestamp: string;
}

/**
 * Interface for cached user portfolio summary data
 */
export interface CachedUserPortfolioSummary {
  data: {
    userId: string;
    totalValue: number;
    currency: string;
    lastUpdated: string;
    stocks: {
      symbol: string;
      name: string;
      quantity: number;
      currentPrice: number;
      profitLoss: {
        absolute: number;
        percentage: number;
      };
    }[];
  };
  timestamp: string;
} 