import { handler } from '../cron/update-stock-tokens';
import { DynamoDB } from 'aws-sdk';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { DailyStockTokenService } from '../../services/daily-stock-token-service';
import { AppError } from '../../utils/errors/app-error';

// Mock dependencies
jest.mock('aws-sdk');
jest.mock('../../repositories/stock-token-repository');
jest.mock('../../services/vendor/api-client');
jest.mock('../../repositories/vendor-api-repository');
jest.mock('../../services/daily-stock-token-service');
jest.mock('../../types/schemas/handlers', () => ({
  updateStockTokensEventSchema: {
    parse: jest.fn().mockImplementation(event => event)
  },
  apiKeySchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
    })
  }
}));

describe('Update Stock Tokens Handler', () => {
  // Setup mocks
  const mockUpdateStockTokens = jest.fn();
  const mockServiceInstance = {
    updateStockTokens: mockUpdateStockTokens
  };
  
  // Set environment variables for testing
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Setup DynamoDB mock
    (DynamoDB.DocumentClient as jest.Mock).mockImplementation(() => ({}));
    
    // Setup common mocks
    (StockTokenRepository as jest.Mock).mockImplementation(() => ({}));
    (VendorApiRepository as jest.Mock).mockImplementation(() => ({}));
    (VendorApiClient as jest.Mock).mockImplementation(() => ({}));
    (DailyStockTokenService as jest.Mock).mockImplementation(() => mockServiceInstance);
    
    // Mock update stock tokens method
    mockUpdateStockTokens.mockResolvedValue(undefined);
    
    // Setup mock environment variables
    process.env = {
      ...originalEnv,
      DYNAMODB_REGION: 'test-region',
      DYNAMODB_ACCESS_KEY_ID: 'test-key',
      DYNAMODB_SECRET_ACCESS_KEY: 'test-secret',
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      DYNAMODB_TABLE: 'test-stock-tokens-table'
    };
    
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  it('should initialize services and call updateStockTokens', async () => {
    // Create a mock event
    const mockEvent = {};
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    // Verify that DynamoDB was initialized with correct config
    expect(DynamoDB.DocumentClient).toHaveBeenCalledWith({
      region: 'test-region',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      },
      endpoint: 'http://localhost:8000'
    });
    
    // Verify that stock token repo was initialized with correct table
    expect(StockTokenRepository).toHaveBeenCalledWith(
      expect.any(Object),
      'test-stock-tokens-table'
    );
    
    // Verify that updateStockTokens was called
    expect(mockUpdateStockTokens).toHaveBeenCalled();
    
    // Verify response body
    expect(body.status).toBe('success');
    expect(body.message).toBe('Stock tokens updated successfully');
  });
  
  it('should handle service errors correctly', async () => {
    // Make the service throw an error
    mockUpdateStockTokens.mockRejectedValue(new Error('Failed to connect to vendor API'));
    
    // Create a mock event
    const mockEvent = {};
    
    // Call the handler and expect a 500 error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    
    // Verify response error body
    expect(body.status).toBe('error');
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Failed to update stock tokens');
  });
  
  it('should use default values when environment variables are not set', async () => {
    // Remove all environment variables
    process.env = {};
    
    // Create a mock event
    const mockEvent = {};
    
    // Call the handler
    await handler(mockEvent, {} as any, null as any);
    
    // Verify that DynamoDB was initialized with default values
    expect(DynamoDB.DocumentClient).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
      },
      endpoint: undefined
    });
    
    // Verify that stock token repo was initialized with default table name
    expect(StockTokenRepository).toHaveBeenCalledWith(
      expect.any(Object),
      'fuse-stock-tokens-local'
    );
  });
  
  it('should validate the event structure', async () => {
    // Get the schema mock
    const { updateStockTokensEventSchema } = require('../../types/schemas/handlers');
    
    // Create a mock event
    const mockEvent = { test: 'data' };
    
    // Call the handler
    await handler(mockEvent, {} as any, null as any);
    
    // Verify that the schema validation was called with the event
    expect(updateStockTokensEventSchema.parse).toHaveBeenCalledWith(mockEvent);
  });
}); 