import { ReportService } from '../report-service';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { TransactionStatus } from '../../types/common/enums';
import { ITransaction } from '../../types/models/transaction';

describe('ReportService', () => {
  let reportService: ReportService;
  let mockTransactionRepository: jest.Mocked<TransactionRepository>;
  
  beforeEach(() => {
    // Create mock repository
    mockTransactionRepository = {
      findByDate: jest.fn(),
    } as any;
    
    // Initialize service with mock repository
    reportService = new ReportService(mockTransactionRepository);
  });
  
  describe('generateDailyReport', () => {
    const mockDate = '2025-04-28';
    const mockTransactions: ITransaction[] = [
      {
        id: 1,
        user_id: 'user1',
        portfolio_id: 101,
        stock_symbol: 'AAPL',
        quantity: 10,
        price: 150.00,
        status: TransactionStatus.COMPLETED,
        created_at: new Date(mockDate),
        updated_at: new Date(mockDate),
      },
      {
        id: 2,
        user_id: 'user1',
        portfolio_id: 101,
        stock_symbol: 'AAPL',
        quantity: 5,
        price: 150.50,
        status: TransactionStatus.FAILED,
        notes: 'Insufficient funds',
        created_at: new Date(mockDate),
        updated_at: new Date(mockDate),
      },
      {
        id: 3,
        user_id: 'user2',
        portfolio_id: 102,
        stock_symbol: 'TSLA',
        quantity: 2,
        price: 800.00,
        status: TransactionStatus.COMPLETED,
        created_at: new Date(mockDate),
        updated_at: new Date(mockDate),
      }
    ];
    
    it('should generate a report with correct totals', async () => {
      mockTransactionRepository.findByDate.mockResolvedValue(mockTransactions);
      
      const report = await reportService.generateDailyReport(mockDate);
      
      // Verify repository was called with correct date
      expect(mockTransactionRepository.findByDate).toHaveBeenCalledWith(mockDate);
      
      // Verify report structure and totals
      expect(report).toEqual({
        date: mockDate,
        totalTransactions: 3,
        successfulTransactions: expect.arrayContaining([
          expect.objectContaining({ id: 1, stock_symbol: 'AAPL' }),
          expect.objectContaining({ id: 3, stock_symbol: 'TSLA' })
        ]),
        failedTransactions: expect.arrayContaining([
          expect.objectContaining({ id: 2, stock_symbol: 'AAPL', notes: 'Insufficient funds' })
        ]),
        summaryBySymbol: {
          'AAPL': {
            total: 2,
            successful: 1,
            failed: 1,
            totalAmount: 10 * 150.00 + 5 * 150.50
          },
          'TSLA': {
            total: 1,
            successful: 1,
            failed: 0,
            totalAmount: 2 * 800.00
          }
        },
        totals: {
          successfulAmount: 10 * 150.00 + 2 * 800.00,
          failedAmount: 5 * 150.50,
          totalAmount: 10 * 150.00 + 5 * 150.50 + 2 * 800.00
        }
      });
      
      // Verify specific calculations
      expect(report.totals.successfulAmount).toBe(10 * 150.00 + 2 * 800.00);
      expect(report.totals.failedAmount).toBe(5 * 150.50);
      expect(report.totals.totalAmount).toBe(10 * 150.00 + 5 * 150.50 + 2 * 800.00);
    });
    
    it('should handle empty transactions list', async () => {
      mockTransactionRepository.findByDate.mockResolvedValue([]);
      
      const report = await reportService.generateDailyReport(mockDate);
      
      expect(report).toEqual({
        date: mockDate,
        totalTransactions: 0,
        successfulTransactions: [],
        failedTransactions: [],
        summaryBySymbol: {},
        totals: {
          successfulAmount: 0,
          failedAmount: 0,
          totalAmount: 0
        }
      });
    });
    
    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      mockTransactionRepository.findByDate.mockRejectedValue(error);
      
      await expect(reportService.generateDailyReport(mockDate)).rejects.toThrow('Database error');
    });
  });
  
  describe('formatReportAsHtml', () => {
    it('should format report data as HTML', () => {
      const mockReportData = {
        date: '2025-04-28',
        totalTransactions: 3,
        successfulTransactions: [
          {
            id: 1,
            user_id: 'user1',
            portfolio_id: 101,
            stock_symbol: 'AAPL',
            quantity: 10,
            price: 150.00,
            status: TransactionStatus.COMPLETED,
            created_at: new Date('2025-04-28'),
            updated_at: new Date('2025-04-28'),
          },
          {
            id: 3,
            user_id: 'user2',
            portfolio_id: 102,
            stock_symbol: 'TSLA',
            quantity: 2,
            price: 800.00,
            status: TransactionStatus.COMPLETED,
            created_at: new Date('2025-04-28'),
            updated_at: new Date('2025-04-28'),
          }
        ],
        failedTransactions: [
          {
            id: 2,
            user_id: 'user1',
            portfolio_id: 101,
            stock_symbol: 'AAPL',
            quantity: 5,
            price: 150.50,
            status: TransactionStatus.FAILED,
            notes: 'Insufficient funds',
            created_at: new Date('2025-04-28'),
            updated_at: new Date('2025-04-28'),
          }
        ],
        summaryBySymbol: {
          'AAPL': {
            total: 2,
            successful: 1,
            failed: 1,
            totalAmount: 2252.50
          },
          'TSLA': {
            total: 1,
            successful: 1,
            failed: 0,
            totalAmount: 1600.00
          }
        },
        totals: {
          successfulAmount: 3100.00,
          failedAmount: 752.50,
          totalAmount: 3852.50
        }
      };
      
      const html = reportService.formatReportAsHtml(mockReportData);
      
      // Verify HTML contains expected elements
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1>Daily Transaction Report - 2025-04-28</h1>');
      expect(html).toContain('Total transactions: <strong>3</strong>');
      expect(html).toContain('Successful transactions: <strong class="success">2</strong>');
      expect(html).toContain('Failed transactions: <strong class="failure">1</strong>');
      expect(html).toContain('Total processed amount: <strong>$3852.50</strong>');
      
      // Verify symbol summary table
      expect(html).toContain('<th>Symbol</th>');
      expect(html).toContain('<td>AAPL</td>');
      expect(html).toContain('<td>TSLA</td>');
      
      // Verify failed transactions table
      expect(html).toContain('<th>Failure Reason</th>');
      expect(html).toContain('<td>Insufficient funds</td>');
    });
    
    it('should handle report with no failed transactions', () => {
      const mockReportData = {
        date: '2025-04-28',
        totalTransactions: 1,
        successfulTransactions: [
          {
            id: 1,
            user_id: 'user1',
            portfolio_id: 101,
            stock_symbol: 'AAPL',
            quantity: 10,
            price: 150.00,
            status: TransactionStatus.COMPLETED,
            created_at: new Date('2025-04-28'),
            updated_at: new Date('2025-04-28'),
          }
        ],
        failedTransactions: [],
        summaryBySymbol: {
          'AAPL': {
            total: 1,
            successful: 1,
            failed: 0,
            totalAmount: 1500.00
          }
        },
        totals: {
          successfulAmount: 1500.00,
          failedAmount: 0,
          totalAmount: 1500.00
        }
      };
      
      const html = reportService.formatReportAsHtml(mockReportData);
      
      // Verify HTML shows no failed transactions message
      expect(html).toContain('<p>No failed transactions for this date.</p>');
      expect(html).not.toContain('<table>');
    });
  });
});
