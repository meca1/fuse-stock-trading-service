export interface IPortfolio {
  id: number;
  name: string;
  user_id: number;
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