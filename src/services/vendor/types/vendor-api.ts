/**
 * Configuration interface for the Vendor API repository
 */
export interface VendorApiConfig {
  /** Base URL for the API endpoints */
  baseURL: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay between retries in milliseconds */
  initialRetryDelay: number;
  /** Maximum delay between retries in milliseconds */
  maxRetryDelay: number;
  /** Number of failures before opening the circuit breaker */
  circuitBreakerThreshold: number;
  /** Time in milliseconds before the circuit breaker resets */
  circuitBreakerTimeout: number;
}
