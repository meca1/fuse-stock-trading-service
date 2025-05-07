/**
 * Base error class for repository-related errors
 */
export class RepositoryError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Error class for portfolio repository specific errors
 */
export class PortfolioRepositoryError extends RepositoryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'PortfolioRepositoryError';
  }
} 