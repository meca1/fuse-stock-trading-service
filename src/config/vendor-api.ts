import { VendorApiConfig } from '../services/vendor/types/vendor-api';



/**
 * Default configuration for the Vendor API repository
 */
export const DEFAULT_VENDOR_API_CONFIG: VendorApiConfig = {
  baseURL: process.env.VENDOR_API_URL || 'https://api.vendor.com',
  apiKey: process.env.VENDOR_API_KEY || '',
  timeout: 5000,
  maxRetries: 3,
  initialRetryDelay: 1000,
  maxRetryDelay: 10000,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 30000
}; 