import { VendorApiClient } from './api-client';

describe('VendorApiClient', () => {
  let repo: any;
  let client: VendorApiClient;

  beforeEach(() => {
    repo = {
      listStocks: jest.fn(),
      buyStock: jest.fn(),
    };
    client = new VendorApiClient(repo);
  });

  describe('listStocks', () => {
    it('should return stocks', async () => {
      repo.listStocks.mockResolvedValue({ data: { items: [{ symbol: 'AAPL' }], nextToken: 'n' } });
      const result = await client.listStocks('n');
      expect(result.data.items[0].symbol).toBe('AAPL');
      expect(repo.listStocks).toHaveBeenCalledWith('n');
    });
    it('should throw if repo fails', async () => {
      repo.listStocks.mockRejectedValue(new Error('fail'));
      await expect(client.listStocks()).rejects.toThrow('fail');
    });
  });

  describe('buyStock', () => {
    it('should return buy response', async () => {
      repo.buyStock.mockResolvedValue({
        status: 200,
        message: 'Success',
        data: {
          order: {
            symbol: 'AAPL',
            price: 100,
            quantity: 1,
            total: 100,
          },
        },
      });
      const result = await client.buyStock('AAPL', { price: 100, quantity: 1 });
      expect(result.data?.order?.symbol).toBe('AAPL');
      expect(repo.buyStock).toHaveBeenCalledWith('AAPL', { price: 100, quantity: 1 });
    });
    it('should throw if repo fails', async () => {
      repo.buyStock.mockRejectedValue(new Error('fail'));
      await expect(client.buyStock('AAPL', { price: 100, quantity: 1 })).rejects.toThrow('fail');
    });
  });
});
