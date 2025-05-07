import { ReportService } from '../report-service';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { TransactionType, TransactionStatus } from '../../types/common/enums';
import { ITransaction } from '../../types/models/transaction';
import { ReportData } from '../../types/models/shared';

describe('ReportService', () => {
  let reportService: ReportService;
  let mockTransactionRepository: jest.Mocked<TransactionRepository>;
  const mockDate = '2023-05-15';

  beforeEach(() => {
    mockTransactionRepository = {
      findByDate: jest.fn().mockResolvedValue([
        {
          id: '1',
          portfolio_id: '101',
          stock_symbol: 'AAPL',
          type: TransactionType.BUY,
          quantity: 10,
          price: 150,
          status: TransactionStatus.COMPLETED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        },
        {
          id: '2',
          portfolio_id: '101',
          stock_symbol: 'GOOGL',
          type: TransactionType.SELL,
          quantity: 5,
          price: 200,
          status: TransactionStatus.FAILED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        },
        {
          id: '3',
          portfolio_id: '102',
          stock_symbol: 'MSFT',
          type: TransactionType.BUY,
          quantity: 8,
          price: 300,
          status: TransactionStatus.COMPLETED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        }
      ])
    } as any;

    reportService = new ReportService(mockTransactionRepository);
  });

  it('should generate daily report', async () => {
    const report = await reportService.generateDailyReport(mockDate);

    expect(report.date).toBe(mockDate);
    expect(report.totalTransactions).toBe(3);
    expect(report.successfulTransactions).toHaveLength(2);
    expect(report.failedTransactions).toHaveLength(1);
    expect(report.summaryBySymbol).toBeDefined();
    expect(report.totals).toBeDefined();
  });

  it('should format report as HTML', async () => {
    const mockReportData: ReportData = {
      date: mockDate,
      totalTransactions: 3,
      successfulTransactions: [
        {
          id: '1',
          portfolio_id: '101',
          stock_symbol: 'AAPL',
          type: TransactionType.BUY,
          quantity: 10,
          price: 150,
          status: TransactionStatus.COMPLETED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        },
        {
          id: '3',
          portfolio_id: '102',
          stock_symbol: 'MSFT',
          type: TransactionType.BUY,
          quantity: 8,
          price: 300,
          status: TransactionStatus.COMPLETED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        }
      ],
      failedTransactions: [
        {
          id: '2',
          portfolio_id: '101',
          stock_symbol: 'GOOGL',
          type: TransactionType.SELL,
          quantity: 5,
          price: 200,
          status: TransactionStatus.FAILED,
          date: mockDate,
          created_at: mockDate,
          updated_at: mockDate
        }
      ],
      summaryBySymbol: {
        AAPL: {
          total: 1,
          successful: 1,
          failed: 0,
          totalAmount: 1500
        },
        GOOGL: {
          total: 1,
          successful: 0,
          failed: 1,
          totalAmount: 1000
        },
        MSFT: {
          total: 1,
          successful: 1,
          failed: 0,
          totalAmount: 2400
        }
      },
      totals: {
        successfulAmount: 3900,
        failedAmount: 1000,
        totalAmount: 4900
      }
    };

    const html = reportService.formatReportAsHtml(mockReportData);
    expect(html).toContain(mockDate);
    expect(html).toMatch(/Total transactions:\s*<strong>3<\/strong>/);
    expect(html).toContain('AAPL');
    expect(html).toContain('GOOGL');
    expect(html).toContain('MSFT');
  });
});
