import { VendorApiRepository } from '../vendor-api-repository';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VendorApiRepository', () => {
  let repo: VendorApiRepository;
  let client: any;

  beforeEach(() => {
    client = {
      get: jest.fn(),
      post: jest.fn()
    };
    mockedAxios.create.mockReturnValue(client);
    repo = new VendorApiRepository();
  });

  describe('listStocks', () => {
    it('should return stocks data', async () => {
      client.get.mockResolvedValueOnce({ data: { status: 200, data: { items: [{ symbol: 'AAPL' }], nextToken: 'n' } } });
      const result = await repo.listStocks('n');
      expect(result.data.items[0].symbol).toBe('AAPL');
      expect(client.get).toHaveBeenCalledWith('/stocks', { params: { nextToken: 'n' } });
    });
    it('should throw if axios fails', async () => {
      client.get.mockRejectedValueOnce(new Error('fail'));
      await expect(repo.listStocks()).rejects.toThrow('fail');
    });
  });

  describe('getStockPrice', () => {
    it('should return the price if found', async () => {
      client.get.mockResolvedValueOnce({ data: { status: 200, data: { items: [{ symbol: 'AAPL', price: 123 }], nextToken: '' } } });
      const price = await repo.getStockPrice('AAPL');
      expect(price).toBe(123);
    });
    it('should throw if not found', async () => {
      client.get.mockResolvedValueOnce({ data: { status: 200, data: { items: [], nextToken: '' } } });
      await expect(repo.getStockPrice('AAPL')).rejects.toThrow('Stock not found');
    });
    it('should throw if axios fails', async () => {
      client.get.mockRejectedValueOnce(new Error('fail'));
      await expect(repo.getStockPrice('AAPL')).rejects.toThrow('fail');
    });
  });

  describe('buyStock', () => {
    it('should return buy response', async () => {
      client.post.mockResolvedValueOnce({ 
        data: { 
          status: 200, 
          message: 'Success',
          data: { 
            order: { 
              symbol: 'AAPL', 
              price: 100, 
              quantity: 1, 
              total: 100 
            } 
          } 
        } 
      });
      const result = await repo.buyStock('AAPL', { price: 100, quantity: 1 });
      expect(result.data?.order?.symbol).toBe('AAPL');
      expect(client.post).toHaveBeenCalledWith('/stocks/AAPL/buy', { price: 100, quantity: 1 });
    });
    it('should throw if axios fails', async () => {
      client.post.mockRejectedValueOnce(new Error('fail'));
      await expect(repo.buyStock('AAPL', { price: 100, quantity: 1 })).rejects.toThrow('fail');
    });
  });
}); 