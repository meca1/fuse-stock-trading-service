import { PortfolioService } from '../portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { CacheService } from '../cache-service';
import { TransactionType, TransactionStatus } from '../../types/common/enums';
import { IPortfolio } from '../../types/models/portfolio';
import { ITransaction } from '../../types/models/transaction';
import { VendorStock } from '../vendor/types/stock-api';

// Mock CacheService
jest.mock('../cache-service');

describe('PortfolioService', () => {
  let service: PortfolioService;
  let portfolioRepository: jest.Mocked<PortfolioRepository>;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let stockTokenRepository: jest.Mocked<StockTokenRepository>;
  let vendorApiRepository: jest.Mocked<VendorApiRepository>;
  let mockCacheService: jest.Mocked<CacheService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    portfolioRepository = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateValueAndTimestamp: jest.fn(),
      getPortfolioStockSummary: jest.fn(),
    } as any;

    transactionRepository = {
      create: jest.fn(),
      findByPortfolioId: jest.fn(),
    } as any;

    userRepository = {
      findById: jest.fn(),
    } as any;

    stockTokenRepository = {
      getToken: jest.fn(),
      saveToken: jest.fn(),
    } as any;

    vendorApiRepository = {
      listStocks: jest.fn(),
      buyStock: jest.fn(),
    } as any;

    // Create mock CacheService
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      checkTableExists: jest.fn(),
      client: {} as any,
      docClient: {} as any,
      tableName: 'test-table',
    } as any;

    service = new PortfolioService(
      portfolioRepository,
      transactionRepository,
      userRepository,
      stockTokenRepository,
      vendorApiRepository,
      mockCacheService,
    );

    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getUserPortfolios', () => {
    it('returns user portfolios', async () => {
      const mockPortfolios: IPortfolio[] = [
        {
          id: '1',
          user_id: 'user1',
          name: 'Test Portfolio',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      portfolioRepository.findByUserId.mockResolvedValue(mockPortfolios);

      const result = await service.getUserPortfolios('user1');
      expect(result).toEqual(mockPortfolios);
      expect(portfolioRepository.findByUserId).toHaveBeenCalledWith('user1');
    });
  });

  describe('executeStockPurchase', () => {
    it('creates a transaction successfully', async () => {
      const mockStock: VendorStock = {
        symbol: 'AAPL',
        name: 'Apple',
        price: 100,
        exchange: 'NASDAQ',
      };

      const mockPortfolio: IPortfolio = {
        id: '1',
        user_id: 'user1',
        name: 'Test Portfolio',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockTransaction: ITransaction = {
        id: '1',
        portfolio_id: '1',
        stock_symbol: 'AAPL',
        type: TransactionType.BUY,
        quantity: 10,
        price: 100,
        status: TransactionStatus.COMPLETED,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        date: new Date().toISOString(),
      };

      vendorApiRepository.listStocks.mockResolvedValue({
        status: 200,
        data: {
          items: [mockStock],
          nextToken: '',
        },
      });

      portfolioRepository.findById.mockResolvedValue(mockPortfolio);
      vendorApiRepository.buyStock.mockResolvedValue({
        status: 200,
        message: 'Success',
      });
      transactionRepository.create.mockResolvedValue(mockTransaction);

      const result = await service.executeStockPurchase('1', 'AAPL', 10, 100, TransactionType.BUY);

      expect(result).toEqual(mockTransaction);
      expect(transactionRepository.create).toHaveBeenCalled();
    });
  });

  it('createPortfolio creates and returns a portfolio', async () => {
    const user = { id: 'u1', name: 'User' } as any;
    const portfolio = { id: '1', name: 'Test', user_id: 'u1' } as IPortfolio;
    userRepository.findById.mockResolvedValue(user);
    portfolioRepository.create.mockResolvedValue(portfolio);
    const result = await service.createPortfolio('u1', 'Test');
    expect(result).toEqual(portfolio);
  });

  it('getUserPortfolioSummary returns summary with zero if no portfolios', async () => {
    portfolioRepository.findByUserId.mockResolvedValue([]);
    const result = await service.getUserPortfolioSummary('u1');

    expect(result.data.totalValue).toBe(0);
    expect(result.data.stocks).toEqual([]);
  });

  it('getPortfolioSummary returns summary with stocks', async () => {
    portfolioRepository.findById.mockResolvedValue({
      id: '1',
      user_id: 'u1',
      name: 'Test',
    } as IPortfolio);

    portfolioRepository.getPortfolioStockSummary.mockResolvedValue([
      { symbol: 'AAPL', quantity: 2, total_cost: 200 },
    ]);

    stockTokenRepository.getToken.mockResolvedValue('token123');

    vendorApiRepository.listStocks.mockResolvedValue({
      status: 200,
      data: {
        items: [
          {
            symbol: 'AAPL',
            name: 'Apple',
            price: 150,
            exchange: 'NASDAQ',
          },
        ],
        nextToken: 'next',
      },
    });

    portfolioRepository.updateValueAndTimestamp.mockResolvedValue();

    const result = await service.getPortfolioSummary('1');
    expect(result.data.stocks.length).toBe(1);
    expect(result.data.totalValue).toBeGreaterThan(0);
  });

  it('getPortfolioValue returns totalValue', async () => {
    service.getPortfolioSummary = jest.fn().mockResolvedValue({
      data: { totalValue: 123 },
      fromCache: false,
      timestamp: new Date().toISOString(),
    });
    const result = await service.getPortfolioValue('1');
    expect(result).toBe(123);
  });

  describe('Cache operations', () => {
    const mockData = {
      data: {
        userId: 'u1',
        totalValue: 1000,
        currency: 'USD',
        lastUpdated: new Date().toISOString(),
        stocks: [],
      },
      timestamp: new Date().toISOString(),
    };

    it('should cache portfolio summary', async () => {
      await service['cachePortfolioSummary']('1', mockData);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'portfolio:id:1',
        mockData,
        expect.any(Number),
      );
    });

    it('should get cached portfolio summary', async () => {
      mockCacheService.get.mockResolvedValueOnce(mockData);

      const result = await service['getCachedPortfolioSummary']('1');
      expect(result).toEqual(mockData);
    });

    it('should invalidate portfolio cache', async () => {
      await service['invalidatePortfolioCache']('1');

      expect(mockCacheService.delete).toHaveBeenCalledWith('portfolio:id:1');
    });
  });
});
