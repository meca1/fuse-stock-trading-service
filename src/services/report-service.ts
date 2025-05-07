import { TransactionRepository } from '../repositories/transaction-repository';
import { ITransaction } from '../types/models/transaction';
import { TransactionStatus } from '../types/common/enums';
import { IReportService } from './types/report-service';
import { ReportData } from '../types/models/shared';
import { DatabaseService } from '../config/database';

/**
 * Service for generating transaction reports
 */
export class ReportService implements IReportService {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  /**
   * Creates and initializes a new instance of ReportService with all required dependencies
   * @returns Promise with initialized ReportService instance
   */
  public static async initialize(): Promise<ReportService> {
    const dbService = await DatabaseService.getInstance();
    const transactionRepository = new TransactionRepository(dbService);
    return new ReportService(transactionRepository);
  }

  /**
   * Generates a daily transaction report for a specific date
   * @param date Date in YYYY-MM-DD format
   * @returns Report data
   */
  async generateDailyReport(date: string): Promise<ReportData> {
    try {
      // Get all transactions for the date
      const transactions = await this.transactionRepository.findByDate(date);
      
      // Separate successful and failed transactions
      const successfulTransactions = transactions.filter(
        t => t.status === TransactionStatus.COMPLETED
      );
      
      const failedTransactions = transactions.filter(
        t => t.status === TransactionStatus.FAILED
      );
      
      // Create summary by symbol
      const summaryBySymbol: ReportData['summaryBySymbol'] = {};
      
      // Initialize totals
      let successfulAmount = 0;
      let failedAmount = 0;
      
      // Process each transaction for the summary
      transactions.forEach(transaction => {
        const symbol = transaction.stock_symbol;
        const amount = transaction.quantity * transaction.price;
        const isSuccessful = transaction.status === TransactionStatus.COMPLETED;
        
        // Update totals
        if (isSuccessful) {
          successfulAmount += amount;
        } else {
          failedAmount += amount;
        }
        
        // Initialize the symbol summary if it doesn't exist
        if (!summaryBySymbol[symbol]) {
          summaryBySymbol[symbol] = {
            total: 0,
            successful: 0,
            failed: 0,
            totalAmount: 0
          };
        }
        
        // Update symbol summary
        const symbolSummary = summaryBySymbol[symbol];
        symbolSummary.total += 1;
        symbolSummary.totalAmount += amount;
        
        if (isSuccessful) {
          symbolSummary.successful += 1;
        } else {
          symbolSummary.failed += 1;
        }
      });
      
      // Generate final report data
      return {
        date,
        totalTransactions: transactions.length,
        successfulTransactions,
        failedTransactions,
        summaryBySymbol,
        totals: {
          successfulAmount,
          failedAmount,
          totalAmount: successfulAmount + failedAmount
        }
      };
    } catch (error) {
      console.error(`Error generating report for ${date}:`, error);
      throw error;
    }
  }
  
  /**
   * Formats the report data as HTML for email sending
   * @param reportData Report data
   * @returns Formatted HTML
   */
  formatReportAsHtml(reportData: ReportData): string {
    const { date, totalTransactions, successfulTransactions, failedTransactions, summaryBySymbol, totals } = reportData;
    
    // Generate rows for the symbol summary table
    const symbolRows = Object.entries(summaryBySymbol)
      .map(([symbol, data]) => {
        const successRate = data.total > 0 ? Math.round((data.successful / data.total) * 100) : 0;
        return `
          <tr>
            <td>${symbol}</td>
            <td>${data.total}</td>
            <td>${data.successful}</td>
            <td>${data.failed}</td>
            <td>${successRate}%</td>
            <td>$${data.totalAmount.toFixed(2)}</td>
          </tr>
        `;
      })
      .join('');
    
    // Failed transactions table
    const failedRows = failedTransactions
      .map((t: ITransaction) => {
        return `
          <tr>
            <td>${t.id}</td>
            <td>${t.stock_symbol}</td>
            <td>${t.quantity}</td>
            <td>$${t.price}</td>
            <td>$${(t.quantity * t.price).toFixed(2)}</td>
            <td>${t.notes || 'No details'}</td>
          </tr>
        `;
      })
      .join('');
    
    // Generate complete HTML
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { margin-bottom: 20px; }
          .success { color: green; }
          .failure { color: red; }
          h2 { color: #333; }
        </style>
      </head>
      <body>
        <h1>Daily Transaction Report - ${date}</h1>
        
        <div class="summary">
          <h2>Summary</h2>
          <p>Total transactions: <strong>${totalTransactions}</strong></p>
          <p>Successful transactions: <strong class="success">${successfulTransactions.length}</strong></p>
          <p>Failed transactions: <strong class="failure">${failedTransactions.length}</strong></p>
          <p>Total processed amount: <strong>$${totals.totalAmount.toFixed(2)}</strong></p>
          <p>Successful transactions amount: <strong class="success">$${totals.successfulAmount.toFixed(2)}</strong></p>
          <p>Failed transactions amount: <strong class="failure">$${totals.failedAmount.toFixed(2)}</strong></p>
        </div>
        
        <h2>Symbol Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Total</th>
              <th>Successful</th>
              <th>Failed</th>
              <th>Success Rate</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${symbolRows}
          </tbody>
        </table>
        
        <h2>Failed Transactions</h2>
        ${failedTransactions.length === 0 ? '<p>No failed transactions for this date.</p>' : `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Symbol</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Total</th>
              <th>Failure Reason</th>
            </tr>
          </thead>
          <tbody>
            ${failedRows}
          </tbody>
        </table>
        `}
        
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
          This is an automatically generated report. Please do not reply to this email.
        </p>
      </body>
      </html>
    `;
  }
} 