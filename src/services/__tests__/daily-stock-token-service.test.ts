import { StockService } from '../stock-service';

describe('StockService', () => {
  let repo: any;
  let vendor: any;
  let service: StockService;

  beforeEach(() => {
    repo = {
      saveToken: jest.fn()
    };
    vendor = {
      listStocks: jest.fn()
    };
    service = new StockService(repo, vendor);
    
    // Mock checkTableExists to always return true in tests
    service.checkTableExists = jest.fn().mockResolvedValue(true);
  });

  it('should update tokens for all stocks', async () => {
    vendor.listStocks
      .mockResolvedValueOnce({ data: { items: [{ symbol: 'AAPL' }], nextToken: 'n' } })
      .mockResolvedValueOnce({ data: { items: [{ symbol: 'TSLA' }], nextToken: undefined } });
    await service.updateStockTokens();
    expect(repo.saveToken).toHaveBeenCalledWith('AAPL', '');
    expect(repo.saveToken).toHaveBeenCalledWith('TSLA', 'n');
    expect(vendor.listStocks).toHaveBeenCalledTimes(2);
  });

  it('should not run if already running', async () => {
    (service as any).isTokenUpdateRunning = true;
    await service.updateStockTokens();
    expect(vendor.listStocks).not.toHaveBeenCalled();
  });

  it('should throw and reset isTokenUpdateRunning on error', async () => {
    vendor.listStocks.mockRejectedValue(new Error('fail'));
    await expect(service.updateStockTokens()).rejects.toThrow('fail');
    expect((service as any).isTokenUpdateRunning).toBe(false);
  });
});

    