import { ITransaction } from './transaction';

/**
 * Data structure for daily reports
 */
export interface ReportData {
  date: string;
  totalTransactions: number;
  successfulTransactions: ITransaction[];
  failedTransactions: ITransaction[];
  summaryBySymbol: {
    [symbol: string]: {
      total: number;
      successful: number;
      failed: number;
      totalAmount: number;
    };
  };
  totals: {
    successfulAmount: number;
    failedAmount: number;
    totalAmount: number;
  };
}


export interface ReportDataNotifyChangeStockPrice {
  symbol: string;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  priceDiff: number;
  maxDiff: number;
}

/**
 * Interface for email parameters
 */
export interface EmailParams {
  recipients: string[];
  subject: string;
  reportData: ReportData;
}


export interface EmailParamsChangeStockPrice {
  recipients: string[];
  subject: string;
  reportData: ReportDataNotifyChangeStockPrice; 
}