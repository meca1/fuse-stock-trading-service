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

export interface IPortfolio {
  id: number;
  name: string;
  description?: string;
  user_id: string;
  total_value?: number;
  total_profit_loss?: number;
  stocks?: IPortfolioStock[];
  created_at?: Date;
  updated_at?: Date;
}

export interface IPortfolioSummary {
  stock_symbol: string;
  quantity: number;
  current_price: number;
  total_cost: number;
  current_value: number;
  profit_loss: number;
}

export interface PortfolioStock {
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
  profitLoss: {
    absolute: number;
    percentage: number;
  };
}

export interface PortfolioSummaryResponse {
  userId: string;
  totalValue: number;
  currency: string;
  lastUpdated: string;
  stocks: PortfolioStock[];
} 