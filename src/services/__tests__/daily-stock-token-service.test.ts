import { DailyStockTokenService } from '../daily-stock-token-service';

describe('DailyStockTokenService', () => {
  let repo: any;
  let vendor: any;
  let service: DailyStockTokenService;

  beforeEach(() => {
    repo = {
      saveToken: jest.fn()
    };
    vendor = {
      listStocks: jest.fn()
    };
    service = new DailyStockTokenService(repo, vendor);
    
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
    (service as any).isRunning = true;
    await service.updateStockTokens();
    expect(vendor.listStocks).not.toHaveBeenCalled();
  });

  it('should throw and reset isRunning on error', async () => {
    vendor.listStocks.mockRejectedValue(new Error('fail'));
    await expect(service.updateStockTokens()).rejects.toThrow('fail');
    expect((service as any).isRunning).toBe(false);
  });
});

    