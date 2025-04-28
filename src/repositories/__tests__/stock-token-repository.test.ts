import { StockTokenRepository } from '../stock-token-repository';
import { DynamoDB } from 'aws-sdk';

describe('StockTokenRepository', () => {
  let dynamoDb: jest.Mocked<DynamoDB.DocumentClient>;
  let repo: StockTokenRepository;
  const tableName = 'test-table';

  beforeEach(() => {
    dynamoDb = {
      get: jest.fn(),
      put: jest.fn()
    } as any;
    repo = new StockTokenRepository(dynamoDb, tableName);
  });

  describe('getToken', () => {
    it('should return the token if found', async () => {
      dynamoDb.get.mockReturnValueOnce({
        promise: () => Promise.resolve({ Item: { nextToken: 'abc' } })
      } as any);
      const token = await repo.getToken('AAPL');
      expect(token).toBe('abc');
      expect(dynamoDb.get).toHaveBeenCalledWith({ TableName: tableName, Key: { symbol: 'AAPL' } });
    });
    it('should return null if not found', async () => {
      dynamoDb.get.mockReturnValueOnce({
        promise: () => Promise.resolve({})
      } as any);
      const token = await repo.getToken('AAPL');
      expect(token).toBeNull();
    });
    it('should throw if DynamoDB get fails', async () => {
      dynamoDb.get.mockReturnValueOnce({
        promise: () => Promise.reject(new Error('fail'))
      } as any);
      await expect(repo.getToken('AAPL')).rejects.toThrow('fail');
    });
  });

  describe('saveToken', () => {
    it('should save the token', async () => {
      dynamoDb.put.mockReturnValueOnce({
        promise: () => Promise.resolve()
      } as any);
      await repo.saveToken('AAPL', 'token123');
      expect(dynamoDb.put).toHaveBeenCalledWith({
        TableName: tableName,
        Item: expect.objectContaining({ symbol: 'AAPL', nextToken: 'token123' })
      });
    });
    it('should throw if DynamoDB put fails', async () => {
      dynamoDb.put.mockReturnValueOnce({
        promise: () => Promise.reject(new Error('fail'))
      } as any);
      await expect(repo.saveToken('AAPL', 'token123')).rejects.toThrow('fail');
    });
  });
}); 