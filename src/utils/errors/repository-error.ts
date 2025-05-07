/**
 * Base error class for repository errors
 */
export class RepositoryError extends Error {
  public readonly name: string;
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
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

/**
 * Error class for transaction repository specific errors
 */
export class TransactionRepositoryError extends RepositoryError {
  public readonly name: string;

  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'TransactionRepositoryError';
  }
}

/**
 * Error class for user repository specific errors
 */
export class UserRepositoryError extends RepositoryError {
  public readonly name: string;

  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'UserRepositoryError';
  }
}
