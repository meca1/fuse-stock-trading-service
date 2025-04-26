// Interfaces para los modelos de la base de datos

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface IUser {
  id: number;
  name: string;
  email: string;
  password: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface IPortfolio {
  id: number;
  name: string;
  user_id: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface IStock {
  id: number;
  symbol: string;
  name: string;
  current_price: number;
  last_updated?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface ITransaction {
  status: TransactionStatus;
  id: number;
  portfolio_id: number;
  stock_id: number;
  type: TransactionType;
  quantity: number;
  price: number;
  date?: Date;
  created_at?: Date;
  updated_at?: Date;
}
