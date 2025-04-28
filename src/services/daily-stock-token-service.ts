import { VendorApiClient } from './vendor/api-client';
import { StockTokenRepository } from '../repositories/stock-token-repository';

export class DailyStockTokenService {
  private vendorApi: VendorApiClient;
  private stockTokenRepository: StockTokenRepository;
  private isRunning = false;

  constructor(
    stockTokenRepository: StockTokenRepository,
    vendorApi: VendorApiClient
  ) {
    this.vendorApi = vendorApi;
    this.stockTokenRepository = stockTokenRepository;
  }

  public async updateStockTokens(): Promise<void> {
    if (this.isRunning) {
      console.log('Update already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Starting daily stock token update');

    try {
      let currentToken: string | undefined;
      const processedSymbols = new Set<string>();

      do {
        const response = await this.vendorApi.listStocks(currentToken);
        const stocks = response.data.items;
        const nextToken = response.data.nextToken;

        await Promise.all(
          stocks.map(async (stock) => {
            if (!processedSymbols.has(stock.symbol)) {
              await this.stockTokenRepository.saveToken(stock.symbol, currentToken || '');
              processedSymbols.add(stock.symbol);
            }
          })
        );

        currentToken = nextToken;
      } while (currentToken);

      console.log(`Successfully updated tokens for ${processedSymbols.size} stocks`);
    } catch (error) {
      console.error('Error updating stock tokens:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
} 