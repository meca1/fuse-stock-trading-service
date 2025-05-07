import { TransactionRepository } from '../transaction-repository';
import { DatabaseService } from '../../config/database';
import { ITransaction } from '../../types/models/transaction';

describe('TransactionRepository', () => {
  let dbService: jest.Mocked<DatabaseService>;
  let repo: TransactionRepository;

  beforeEach(() => {
    dbService = {
      query: jest.fn(),
    } as any;
    repo = new TransactionRepository(dbService);
  });

  const mockQueryResult = <T>(rows: T[]): any => ({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: [],
  });

  describe('create', () => {
    it('should insert and return the new transaction', async () => {
      const input = {
        portfolio_id: 1,
        stock_symbol: 'AAPL',
        type: 'BUY',
        quantity: 10,
        price: 150,
        status: 'COMPLETED',
        date: new Date().toISOString(),
      } as any;
      const mockTransaction = { id: 1, ...input } as ITransaction;
      dbService.query.mockResolvedValue(mockQueryResult([mockTransaction]));
      const result = await repo.create(input);
      expect(result).toEqual(mockTransaction);
      expect(dbService.query).toHaveBeenCalled();
    });
  });
});
