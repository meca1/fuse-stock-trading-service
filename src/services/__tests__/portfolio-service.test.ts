import { PortfolioService } from '../portfolio-service';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../stock-service';
import { IPortfolio } from '../../types/models/portfolio';
import { ITransaction } from '../../types/models/transaction';
import { TransactionType } from '../../types/common/enums';

describe('PortfolioService', () => {
  let portfolioRepository: jest.Mocked<PortfolioRepository>;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let userRepository: jest.Mocked<UserRepository>;
  let stockService: jest.Mocked<StockService>;
  let service: PortfolioService;

  beforeEach(() => {
    portfolioRepository = { findById: jest.fn(), findByUserId: jest.fn(), create: jest.fn(), getPortfolioStockSummary: jest.fn(), updateValueAndTimestamp: jest.fn() } as any;
    transactionRepository = { create: jest.fn() } as any;
    userRepository = { findById: jest.fn() } as any;
    stockService = { getStockBySymbol: jest.fn() } as any;
    service = new PortfolioService(portfolioRepository, transactionRepository, userRepository, stockService);
  });

  it('getUserPortfolios returns portfolios', async () => {
    const portfolios = [{ id: 1, name: 'Test', user_id: 'u1' } as IPortfolio];
    portfolioRepository.findByUserId.mockResolvedValue(portfolios);
    const result = await service.getUserPortfolios('u1');
    expect(result).toEqual(portfolios);
  });

  it('createPortfolio creates and returns a portfolio', async () => {
    const user = { id: 'u1', name: 'User' } as any;
    const portfolio = { id: 1, name: 'Test', user_id: 'u1' } as IPortfolio;
    userRepository.findById.mockResolvedValue(user);
    portfolioRepository.create.mockResolvedValue(portfolio);
    const result = await service.createPortfolio('u1', 'Test');
    expect(result).toEqual(portfolio);
  });

  it('executeStockPurchase creates a transaction', async () => {
    stockService.getStockBySymbol.mockResolvedValue({ symbol: 'AAPL', name: 'Apple', price: 100 });
    transactionRepository.create.mockResolvedValue({ id: 1 } as ITransaction);
    const result = await service.executeStockPurchase(1, 'AAPL', 1, 100, TransactionType.BUY);
    expect(result).toEqual({ id: 1 });
  });

  it('getUserPortfolioSummary returns summary with zero if no portfolios', async () => {
    portfolioRepository.findByUserId.mockResolvedValue([]);
    const result = await service.getUserPortfolioSummary('u1');
    expect(result.data.totalValue).toBe(0);
    expect(result.data.stocks).toEqual([]);
  });

  it('getPortfolioSummary returns summary with stocks', async () => {
    portfolioRepository.findById.mockResolvedValue({ id: 1, user_id: 'u1', name: 'Test' } as IPortfolio);
    portfolioRepository.getPortfolioStockSummary.mockResolvedValue([
      { symbol: 'AAPL', quantity: 2, total_cost: 200 }
    ]);
    stockService.getStockBySymbol.mockResolvedValue({ symbol: 'AAPL', name: 'Apple', price: 150 });
    portfolioRepository.updateValueAndTimestamp.mockResolvedValue();
    const result = await service.getPortfolioSummary(1);
    expect(result.stocks.length).toBe(1);
    expect(result.totalValue).toBeGreaterThan(0);
  });

  it('getPortfolioValue returns totalValue', async () => {
    service.getPortfolioSummary = jest.fn().mockResolvedValue({ totalValue: 123 } as any);
    const result = await service.getPortfolioValue(1);
    expect(result).toBe(123);
  });
}); 