import { PortfolioCacheService } from '../portfolio-cache-service';
import { DynamoDB } from 'aws-sdk';

describe('PortfolioCacheService', () => {
  let cacheService: PortfolioCacheService;
  let mockDynamoDb: jest.Mocked<DynamoDB.DocumentClient>;
  const mockTableName = 'test-cache-table';
  
  beforeEach(() => {
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
    
    // Initialize service with mock DynamoDB
    cacheService = new PortfolioCacheService(mockDynamoDb, mockTableName, true);
    
    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('checkTableExists', () => {
    it('should return true when table exists', async () => {
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ Item: null })
      } as any);
      
      const result = await cacheService.checkTableExists();
      
      expect(result).toBe(true);
      expect(mockDynamoDb.get).toHaveBeenCalledWith({
        TableName: mockTableName,
        Key: expect.objectContaining({ key: expect.stringContaining('table-check-') })
      });
    });
    
    it('should return false and disable cache when table does not exist', async () => {
      const error = new Error('ResourceNotFoundException');
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockRejectedValue(error)
      } as any);
      
      const result = await cacheService.checkTableExists();
      
      expect(result).toBe(false);
      expect(cacheService['isEnabled']).toBe(false);
    });
    
    it('should return true for other errors but not disable cache', async () => {
      const error = new Error('Other error');
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockRejectedValue(error)
      } as any);
      
      const result = await cacheService.checkTableExists();
      
      expect(result).toBe(true);
      expect(cacheService['isEnabled']).toBe(true);
    });
  });
  
  describe('getCachedUserPortfolioSummary', () => {
    it('should return null when cache is disabled', async () => {
      cacheService = new PortfolioCacheService(mockDynamoDb, mockTableName, false);
      
      const result = await cacheService.getCachedUserPortfolioSummary('user123');
      
      expect(result).toBeNull();
      expect(mockDynamoDb.get).not.toHaveBeenCalled();
    });
    
    it('should return cached data when valid cache exists', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockCacheData = { portfolios: [{ id: 1, name: 'Test Portfolio' }] };
      
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            key: 'portfolio:user:user123',
            data: mockCacheData,
            ttl: now + 300 // Valid TTL (5 minutes in the future)
          }
        })
      } as any);
      
      const result = await cacheService.getCachedUserPortfolioSummary('user123');
      
      expect(result).toEqual(mockCacheData);
      expect(mockDynamoDb.get).toHaveBeenCalledWith({
        TableName: mockTableName,
        Key: { key: 'portfolio:user:user123' }
      });
    });
    
    it('should return null when cache has expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            key: 'portfolio:user:user123',
            data: { portfolios: [] },
            ttl: now - 10 // Expired TTL (10 seconds in the past)
          }
        })
      } as any);
      
      const result = await cacheService.getCachedUserPortfolioSummary('user123');
      
      expect(result).toBeNull();
    });
    
    it('should return null when no cache exists', async () => {
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      const result = await cacheService.getCachedUserPortfolioSummary('user123');
      
      expect(result).toBeNull();
    });
    
    it('should return null when error occurs', async () => {
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('DynamoDB error'))
      } as any);
      
      const result = await cacheService.getCachedUserPortfolioSummary('user123');
      
      expect(result).toBeNull();
    });
  });
  
  describe('cacheUserPortfolioSummary', () => {
    it('should not attempt to cache when disabled', async () => {
      cacheService = new PortfolioCacheService(mockDynamoDb, mockTableName, false);
      
      await cacheService.cacheUserPortfolioSummary('user123', { portfolios: [] });
      
      expect(mockDynamoDb.put).not.toHaveBeenCalled();
    });
    
    it('should cache data with correct TTL', async () => {
      const checkTableExistsSpy = jest.spyOn(cacheService, 'checkTableExists').mockResolvedValue(true);
      const mockData = { portfolios: [{ id: 1 }] };
      
      mockDynamoDb.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      await cacheService.cacheUserPortfolioSummary('user123', mockData);
      
      expect(checkTableExistsSpy).toHaveBeenCalled();
      expect(mockDynamoDb.put).toHaveBeenCalledWith({
        TableName: mockTableName,
        Item: {
          key: 'portfolio:user:user123',
          data: mockData,
          ttl: expect.any(Number)
        }
      });
      
      // Verify TTL is in the future (within 5 minutes)
      const ttl = mockDynamoDb.put.mock.calls[0][0].Item.ttl;
      const now = Math.floor(Date.now() / 1000);
      expect(ttl).toBeGreaterThan(now);
      expect(ttl).toBeLessThanOrEqual(now + 300);
    });
    
    it('should add timestamp to data if not provided', async () => {
      jest.spyOn(cacheService, 'checkTableExists').mockResolvedValue(true);
      const mockData = { portfolios: [{ id: 1 }] };
      
      mockDynamoDb.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      await cacheService.cacheUserPortfolioSummary('user123', mockData);
      
      const cachedData = mockDynamoDb.put.mock.calls[0][0].Item.data;
      expect(cachedData.timestamp).toBeDefined();
      expect(typeof cachedData.timestamp).toBe('string');
    });
    
    it('should not throw when error occurs', async () => {
      jest.spyOn(cacheService, 'checkTableExists').mockResolvedValue(true);
      
      mockDynamoDb.put.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('DynamoDB error'))
      } as any);
      
      // Should not throw
      await expect(cacheService.cacheUserPortfolioSummary('user123', { portfolios: [] }))
        .resolves.not.toThrow();
    });
  });
  
  describe('getCachedPortfolioSummary', () => {
    it('should return null when cache is disabled', async () => {
      cacheService = new PortfolioCacheService(mockDynamoDb, mockTableName, false);
      
      const result = await cacheService.getCachedPortfolioSummary(123);
      
      expect(result).toBeNull();
      expect(mockDynamoDb.get).not.toHaveBeenCalled();
    });
    
    it('should return cached data when valid cache exists', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockCacheData = { id: 123, stocks: [{ symbol: 'AAPL', quantity: 10 }] };
      
      mockDynamoDb.get.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Item: {
            key: 'portfolio:id:123',
            data: mockCacheData,
            ttl: now + 300 // Valid TTL
          }
        })
      } as any);
      
      const result = await cacheService.getCachedPortfolioSummary(123);
      
      expect(result).toEqual(mockCacheData);
      expect(mockDynamoDb.get).toHaveBeenCalledWith({
        TableName: mockTableName,
        Key: { key: 'portfolio:id:123' }
      });
    });
  });
  
  describe('cachePortfolioSummary', () => {
    it('should cache portfolio data correctly', async () => {
      jest.spyOn(cacheService, 'checkTableExists').mockResolvedValue(true);
      const mockData = { id: 123, stocks: [{ symbol: 'AAPL', quantity: 10 }] };
      
      mockDynamoDb.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      await cacheService.cachePortfolioSummary(123, mockData);
      
      expect(mockDynamoDb.put).toHaveBeenCalledWith({
        TableName: mockTableName,
        Item: {
          key: 'portfolio:id:123',
          data: mockData,
          ttl: expect.any(Number)
        }
      });
    });
  });
  
  describe('invalidateUserCache', () => {
    it('should delete user cache', async () => {
      mockDynamoDb.delete.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      await cacheService.invalidateUserCache('user123');
      
      expect(mockDynamoDb.delete).toHaveBeenCalledWith({
        TableName: mockTableName,
        Key: { key: 'portfolio:user:user123' }
      });
    });
    
    it('should not throw when error occurs', async () => {
      mockDynamoDb.delete.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('DynamoDB error'))
      } as any);
      
      await expect(cacheService.invalidateUserCache('user123'))
        .resolves.not.toThrow();
    });
  });
  
  describe('invalidatePortfolioCache', () => {
    it('should delete portfolio cache', async () => {
      mockDynamoDb.delete.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      } as any);
      
      await cacheService.invalidatePortfolioCache(123);
      
      expect(mockDynamoDb.delete).toHaveBeenCalledWith({
        TableName: mockTableName,
        Key: { key: 'portfolio:id:123' }
      });
    });
  });
});
