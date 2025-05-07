/**
 * Custom error class for vendor API errors
 */
export class VendorApiException extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'VendorApiException';
  }
}
