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
  id: string;
  name: string;
  email: string;
  password: string;
  isActive: boolean;
}

export interface IPortfolio {
  id: string;
  name: string;
  description?: string;
  balance: number;
  userId: string;
}

export interface IStock {
  symbol: string;
  name: string;
  currentPrice: number;
  lastUpdated: Date;
  description?: string;
}

export interface ITransaction {
  id: string;
  portfolioId: string;
  stockSymbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  totalAmount: number;
  status: TransactionStatus;
  errorMessage?: string;
  transactionDate: Date;
}
