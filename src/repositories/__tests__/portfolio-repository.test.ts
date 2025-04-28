import { PortfolioRepository } from '../portfolio-repository';
import { DatabaseService } from '../../config/database';
import { IPortfolio } from '../../types/models/portfolio';

describe('PortfolioRepository', () => {
  let dbService: jest.Mocked<DatabaseService>;
  let repo: PortfolioRepository;

  beforeEach(() => {
    dbService = {
      query: jest.fn()
    } as any;
    repo = new PortfolioRepository(dbService);
  });

  const mockQueryResult = <T>(rows: T[]): any => ({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: []
  });

  describe('findById', () => {
    it('should return a portfolio if found', async () => {
      const mockPortfolio: IPortfolio = { id: 1, name: 'Test', user_id: 'u1' } as IPortfolio;
      dbService.query.mockResolvedValue(mockQueryResult([mockPortfolio]));
      const result = await repo.findById(1);
      expect(result).toEqual(mockPortfolio);
      expect(dbService.query).toHaveBeenCalledWith('SELECT * FROM portfolios WHERE id = $1', [1]);
    });
    it('should return null if not found', async () => {
      dbService.query.mockResolvedValue(mockQueryResult([]));
      const result = await repo.findById(2);
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return portfolios for a user', async () => {
      const mockPortfolios: IPortfolio[] = [
        { id: 1, name: 'Test', user_id: 'u1' } as IPortfolio
      ];
      dbService.query.mockResolvedValue(mockQueryResult(mockPortfolios));
      const result = await repo.findByUserId('u1');
      expect(result).toEqual(mockPortfolios);
      expect(dbService.query).toHaveBeenCalledWith('SELECT * FROM portfolios WHERE user_id = $1', ['u1']);
    });
  });

  describe('create', () => {
    it('should insert and return the new portfolio', async () => {
      const input = { name: 'New', user_id: 'u2' } as any;
      const mockPortfolio = { id: 2, name: 'New', user_id: 'u2' } as IPortfolio;
      dbService.query.mockResolvedValue(mockQueryResult([mockPortfolio]));
      const result = await repo.create(input);
      expect(result).toEqual(mockPortfolio);
      expect(dbService.query).toHaveBeenCalled();
    });
  });

  describe('getPortfolioStockSummary', () => {
    it('should return stock summary for a portfolio', async () => {
      const summary = [{ symbol: 'AAPL', quantity: 2, total_cost: 300 }];
      dbService.query.mockResolvedValue(mockQueryResult(summary));
      const result = await repo.getPortfolioStockSummary(1);
      expect(result).toEqual(summary);
      expect(dbService.query).toHaveBeenCalled();
    });
  });

  describe('updateValueAndTimestamp', () => {
    it('should update the portfolio value and timestamp', async () => {
      dbService.query.mockResolvedValue(mockQueryResult([]));
      await repo.updateValueAndTimestamp(1, 1000);
      expect(dbService.query).toHaveBeenCalledWith(
        `UPDATE portfolios \n       SET total_value = $2,\n           updated_at = NOW() \n       WHERE id = $1`,
        [1, 1000]
      );
    });
  });
}); 