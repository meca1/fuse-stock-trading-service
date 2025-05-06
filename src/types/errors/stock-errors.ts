/**
 * Error thrown when a stock is not found
 */
export class StockNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Stock with symbol ${symbol} not found`);
    this.name = 'StockNotFoundError';
  }
}

/**
 * Error thrown when a stock price is not within the allowed range
 */
export class InvalidPriceError extends Error {
  constructor(currentPrice: number, requestedPrice: number, threshold: number) {
    super(`Price must be within ${threshold * 100}% of current price ($${currentPrice})`);
    this.name = 'InvalidPriceError';
  }
} 