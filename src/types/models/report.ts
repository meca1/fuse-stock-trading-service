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
    }
  };
  totals: {
    successfulAmount: number;
    failedAmount: number;
    totalAmount: number;
  };
}

/**
 * Interface for the report service
 */
export interface IReportService {
  generateDailyReport(date: string): Promise<ReportData>;
  formatReportAsHtml(reportData: ReportData): string;
} 