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