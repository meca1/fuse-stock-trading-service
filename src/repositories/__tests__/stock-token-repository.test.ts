import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { StockTokenRepository } from '../stock-token-repository';
import { CacheService } from '../../services/cache-service';

// Mock CacheService
jest.mock('../../services/cache-service');

describe('StockTokenRepository', () => {
  let repo: StockTokenRepository;
  let mockCacheService: jest.Mocked<CacheService>;
  const tableName = 'test-stock-tokens';

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instance
    mockCacheService = new CacheService({
      tableName,
      region: 'local',
      accessKeyId: 'local',
      secretAccessKey: 'local',
      endpoint: 'http://localhost:8000'
    }) as jest.Mocked<CacheService>;

    repo = new StockTokenRepository(mockCacheService);
  });

  describe('getToken', () => {
    it('should return the token if found', async () => {
      mockCacheService.get.mockResolvedValueOnce({ nextToken: 'abc', lastUpdated: new Date().toISOString() });
      const token = await repo.getToken('AAPL');
      expect(token).toBe('abc');
      expect(mockCacheService.get).toHaveBeenCalledWith('AAPL');
    });

    it('should return null if not found', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      const token = await repo.getToken('AAPL');
      expect(token).toBeNull();
      expect(mockCacheService.get).toHaveBeenCalledWith('AAPL');
    });

    it('should return null if CacheService get fails', async () => {
      mockCacheService.get.mockRejectedValueOnce(new Error('fail'));
      const token = await repo.getToken('AAPL');
      expect(token).toBeNull();
      expect(mockCacheService.get).toHaveBeenCalledWith('AAPL');
    });
  });

  describe('saveToken', () => {
    it('should save the token', async () => {
      mockCacheService.set.mockResolvedValueOnce();
      await repo.saveToken('AAPL', 'token123');
      expect(mockCacheService.set).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        nextToken: 'token123',
        lastUpdated: expect.any(String)
      }));
    });

    it('should throw if CacheService set fails', async () => {
      mockCacheService.set.mockRejectedValueOnce(new Error('fail'));
      await expect(repo.saveToken('AAPL', 'token123')).rejects.toThrow('fail');
      expect(mockCacheService.set).toHaveBeenCalledWith('AAPL', expect.objectContaining({
        nextToken: 'token123',
        lastUpdated: expect.any(String)
      }));
    });
  });
}); 