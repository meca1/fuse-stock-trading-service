import { StockService } from '../stock-service';

describe('StockService', () => {
  let repo: any;
  let vendor: any;
  let service: StockService;

  beforeEach(() => {
    repo = {
      getToken: jest.fn(),
      saveToken: jest.fn()
    };
    vendor = {
      listStocks: jest.fn()
    };
    service = new StockService(repo, vendor);
  });

  describe('listAllStocks', () => {
    it('should return filtered stocks and metadata', async () => {
      vendor.listStocks.mockResolvedValue({
        data: {
          items: [
            { symbol: 'AAPL', name: 'Apple', price: 100, timestamp: 'now', exchange: 'NYSE', percentageChange: 1, volume: 1000 },
            { symbol: 'TSLA', name: 'Tesla', price: 200, timestamp: 'now', exchange: 'NASDAQ', percentageChange: 2, volume: 2000 }
          ],
          nextToken: 'n'
        }
      });
      const result = await service.listAllStocks('n', 'AAPL');
      expect(result.stocks.length).toBe(1);
      expect(result.stocks[0].symbol).toBe('AAPL');
      expect(result.nextToken).toBe('n');
    });
    it('should handle no search', async () => {
      vendor.listStocks.mockResolvedValue({
        data: {
          items: [
            { symbol: 'AAPL', name: 'Apple', price: 100, timestamp: 'now', exchange: 'NYSE', percentageChange: 1, volume: 1000 }
          ],
          nextToken: undefined
        }
      });
      const result = await service.listAllStocks();
      expect(result.stocks.length).toBe(1);
    });
    it('should throw on error', async () => {
      vendor.listStocks.mockRejectedValue(new Error('fail'));
      await expect(service.listAllStocks()).rejects.toThrow('fail');
    });
  });

  describe('getStockBySymbol', () => {
    it('should return stock if found with token', async () => {
      repo.getToken.mockResolvedValue('tok');
      vendor.listStocks.mockResolvedValue({
        data: { items: [{ symbol: 'AAPL', name: 'Apple', price: 100, exchange: 'NYSE' }], nextToken: '' }
      });
      const stock = await service.getStockBySymbol('AAPL');
      expect(stock).toEqual({ symbol: 'AAPL', name: 'Apple', price: 100, exchange: 'NYSE' });
    });
    it('should return stock if found in first page', async () => {
      repo.getToken.mockResolvedValue(null);
      vendor.listStocks.mockResolvedValue({
        data: { items: [{ symbol: 'AAPL', name: 'Apple', price: 100, exchange: 'NYSE' }], nextToken: '' }
      });
      const stock = await service.getStockBySymbol('AAPL');
      expect(stock).toEqual({ symbol: 'AAPL', name: 'Apple', price: 100, exchange: 'NYSE' });
    });
    it('should return null if not found', async () => {
      repo.getToken.mockResolvedValue(null);
      vendor.listStocks.mockResolvedValue({ data: { items: [], nextToken: '' } });
      const stock = await service.getStockBySymbol('AAPL');
      expect(stock).toBeNull();
    });
    it('should throw on error', async () => {
      repo.getToken.mockRejectedValue(new Error('fail'));
      await expect(service.getStockBySymbol('AAPL')).rejects.toThrow('fail');
    });
  });

  describe('isValidPrice', () => {
    it('should validate price within 2%', () => {
      expect(service.isValidPrice(100, 101.9)).toBe(true);
      expect(service.isValidPrice(100, 98.1)).toBe(true);
      expect(service.isValidPrice(100, 97)).toBe(false);
      expect(service.isValidPrice(100, 103)).toBe(false);
    });
  });

  describe('getCurrentPrice', () => {
    it('should return price if stock found', async () => {
      service.getStockBySymbol = jest.fn().mockResolvedValue({ price: 123 });
      const result = await service.getCurrentPrice('AAPL');
      expect(result.price).toBe(123);
    });
    it('should throw if stock not found', async () => {
      service.getStockBySymbol = jest.fn().mockResolvedValue(null);
      await expect(service.getCurrentPrice('AAPL')).rejects.toThrow('Stock not found');
    });
    it('should throw on error', async () => {
      service.getStockBySymbol = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(service.getCurrentPrice('AAPL')).rejects.toThrow('fail');
    });
  });
}); 