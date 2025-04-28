import { TransactionRepository } from '../repositories/transaction-repository';
import { ITransaction } from '../types/models/transaction';

// Tipos para ReportService
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

export interface IReportService {
  generateDailyReport(date: string): Promise<ReportData>;
  formatReportAsHtml(reportData: ReportData): string;
}

// Tipos para EmailService
export interface EmailParams {
  recipients: string[];
  subject: string;
  reportData: ReportData;
}

export interface IEmailService {
  sendReportEmail(params: EmailParams): Promise<void>;
} 