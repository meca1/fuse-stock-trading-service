export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface ITransaction {
  id: number;
  portfolio_id: number;
  stock_id: number;
  type: TransactionType;
  quantity: number;
  price: number;
  date: Date;
  status: TransactionStatus;
  created_at: Date;
  updated_at: Date;
} 