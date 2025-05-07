import { PortfolioService } from '../portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../stock-service';
import { IPortfolio } from '../../types/models/portfolio';
import { ITransaction } from '../../types/models/transaction';
import { TransactionType } from '../../types/common/enums';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

describe('PortfolioService', () => {
  let portfolioRepository: jest.Mocked<PortfolioRepository>;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let stockService: jest.Mocked<StockService>;
  let mockDynamoDb: jest.Mocked<DynamoDBDocument>;
  let service: PortfolioService;

  beforeEach(() => {
    portfolioRepository = { 
      findById: jest.fn(), 
      findByUserId: jest.fn(), 
      create: jest.fn(), 
      getPortfolioStockSummary: jest.fn(), 
      updateValueAndTimestamp: jest.fn() 
    } as any;
    
    transactionRepository = { create: jest.fn() } as any;
    userRepository = { findById: jest.fn() } as any;
    
    stockService = { 
      getStockBySymbol: jest.fn(), 
      isValidPrice: jest.fn(),
      buyStock: jest.fn().mockResolvedValue({ status: 200, message: 'Success', data: { order: { transactionId: 'tx123' } } })
    } as any;
    
    // Mock DynamoDB client
    mockDynamoDb = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      query: jest.fn(),
      scan: jest.fn(),
      batchGet: jest.fn(),
      batchWrite: jest.fn(),
      transactGet: jest.fn(),
      transactWrite: jest.fn(),
      createSet: jest.fn(),
    } as any;
    
    service = new PortfolioService(
      portfolioRepository, 
      transactionRepository, 
      userRepository, 
      stockService,
    );

    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getUserPortfolios returns portfolios', async () => {
    const portfolios = [{ id: '1', name: 'Test', user_id: 'u1' } as IPortfolio];
    portfolioRepository.findByUserId.mockResolvedValue(portfolios);
    const result = await service.getUserPortfolios('u1');
    expect(result).toEqual(portfolios);
  });

  it('createPortfolio creates and returns a portfolio', async () => {
    const user = { id: 'u1', name: 'User' } as any;
    const portfolio = { id: '1', name: 'Test', user_id: 'u1' } as IPortfolio;
    userRepository.findById.mockResolvedValue(user);
    portfolioRepository.create.mockResolvedValue(portfolio);
    const result = await service.createPortfolio('u1', 'Test');
    expect(result).toEqual(portfolio);
  });

  it('executeStockPurchase creates a transaction', async () => {
    // Mock para stock
    stockService.getStockBySymbol.mockResolvedValue({ 
      symbol: 'AAPL', 
      name: 'Apple', 
      price: 100,
      exchange: 'NASDAQ'
    });
    stockService.isValidPrice.mockReturnValue(true);
    
    // Mock para portfolio
    portfolioRepository.findById.mockResolvedValue({ 
      id: '1', 
      name: 'Test Portfolio', 
      user_id: 'u1' 
    } as IPortfolio);
    
    // Mock para transaction
    transactionRepository.create.mockResolvedValue({ 
      id: '1',
      portfolio_id: '1',
      stock_symbol: 'AAPL',
      type: TransactionType.BUY,
      quantity: 1,
      price: 100,
      status: 'COMPLETED',
      date: new Date().toISOString()
    } as ITransaction);
    
    const result = await service.executeStockPurchase('1', 'AAPL', 1, 100, TransactionType.BUY);
    expect(result).toBeDefined();
    expect(mockDynamoDb.delete).toHaveBeenCalled();
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
      name: 'Test' 
    } as IPortfolio);
    
    portfolioRepository.getPortfolioStockSummary.mockResolvedValue([
      { symbol: 'AAPL', quantity: 2, total_cost: 200 }
    ]);
    
    stockService.getStockBySymbol.mockResolvedValue({ 
      symbol: 'AAPL', 
      name: 'Apple', 
      price: 150,
      exchange: 'NASDAQ'
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
      timestamp: new Date().toISOString()
    });
    const result = await service.getPortfolioValue('1');
    expect(result).toBe(123);
  });

  describe('Cache operations', () => {
    it('should cache portfolio summary', async () => {
      const mockData = {
        data: {
          userId: 'u1',
          totalValue: 1000,
          currency: 'USD',
          lastUpdated: new Date().toISOString(),
          stocks: []
        },
        timestamp: new Date().toISOString()
      };

      mockDynamoDb.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      await service['cachePortfolioSummary']('1', mockData);

      expect(mockDynamoDb.put).toHaveBeenCalledWith({
        TableName: expect.any(String),
        Item: {
          key: 'portfolio:id:1',
          data: mockData,
          ttl: expect.any(Number)
        }
      });
    });

    it('should get cached portfolio summary', async () => {
      const mockData = {
        data: {
          userId: 'u1',
          totalValue: 1000,
          currency: 'USD',
          lastUpdated: new Date().toISOString(),
          stocks: []
        },
        timestamp: new Date().toISOString()
      };

      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            key: 'portfolio:id:1',
            data: mockData,
            ttl: Math.floor(Date.now() / 1000) + 300
          }
        })
      } as any);

      const result = await service['getCachedPortfolioSummary']('1');
      expect(result).toEqual(mockData);
    });

    it('should invalidate portfolio cache', async () => {
      mockDynamoDb.delete.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);

      await service['invalidatePortfolioCache']('1');

      expect(mockDynamoDb.delete).toHaveBeenCalledWith({
        TableName: expect.any(String),
        Key: { key: 'portfolio:id:1' }
      });
    });
  });
}); 