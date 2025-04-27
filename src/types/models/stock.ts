export interface IStock {
  id: number;
  symbol: string;
  name: string;
  current_price: number;
  page_token?: string;
  page_number?: number;
  exchange?: string;
  last_updated?: Date;
  created_at?: Date;
  updated_at?: Date;
} 