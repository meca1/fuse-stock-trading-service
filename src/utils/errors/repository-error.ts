/**
 * Base error class for repository-related errors
 */
export class RepositoryError extends Error {
  public readonly name: string;

  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Error class for portfolio repository specific errors
 */
export class PortfolioRepositoryError extends RepositoryError {
  public readonly name: string;

  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'PortfolioRepositoryError';
  }
}
