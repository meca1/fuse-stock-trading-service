import { IPortfolioStock } from './portfolio-stock';

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