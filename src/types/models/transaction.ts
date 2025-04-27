import { TransactionStatus, TransactionType } from '../common/enums';

export interface ITransaction {
  id: number;
  portfolio_id: number;
  stock_symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  status: TransactionStatus;
  date?: Date;
  created_at?: Date;
  updated_at?: Date;
} 