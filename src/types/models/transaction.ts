import { TransactionType, TransactionStatus } from '../common/enums';

/**
 * Interface for transaction data
 */
export interface ITransaction {
  id: string;
  portfolio_id: string;
  stock_symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  status: TransactionStatus;
  notes?: string;
  date: string;
  created_at?: string;
  updated_at?: string;
} 