import { UserRepository } from '../user-repository';
import { DatabaseService } from '../../config/database';
import { IUser } from '../../types/models/user';

describe('UserRepository', () => {
  let dbService: jest.Mocked<DatabaseService>;
  let repo: UserRepository;

  beforeEach(() => {
    dbService = {
      query: jest.fn()
    } as any;
    repo = new UserRepository(dbService);
  });

  const mockQueryResult = <T>(rows: T[]): any => ({
    rows,
    command: '',
    rowCount: rows.length,
    oid: 0,
    fields: []
  });

  describe('findById', () => {
    it('should return a user if found', async () => {
      const mockUser: IUser = { id: 'u1', name: 'Test User', email: 'test@example.com' } as IUser;
      dbService.query.mockResolvedValue(mockQueryResult([mockUser]));
      const result = await repo.findById('u1');
      expect(result).toEqual(mockUser);
      expect(dbService.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['u1']);
    });
    it('should return null if not found', async () => {
      dbService.query.mockResolvedValue(mockQueryResult([]));
      const result = await repo.findById('u2');
      expect(result).toBeNull();
    });
  });
}); 