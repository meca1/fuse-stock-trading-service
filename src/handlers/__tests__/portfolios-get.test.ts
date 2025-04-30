import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../portfolios/get';
import { DatabaseService } from '../../config/database';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { UserRepository } from '../../repositories/user-repository';
import { StockService } from '../../services/stock-service';
import { PortfolioService } from '../../services/portfolio-service';
import { PortfolioCacheService } from '../../services/portfolio-cache-service';
import { DynamoDB } from 'aws-sdk';
import { handleZodError } from '../../middleware/zod-error-handler';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../repositories/portfolio-repository');
jest.mock('../../repositories/transaction-repository');
jest.mock('../../repositories/user-repository');
jest.mock('../../services/stock-service');
jest.mock('../../services/portfolio-service');
jest.mock('../../services/portfolio-cache-service');
jest.mock('aws-sdk');
jest.mock('../../middleware/zod-error-handler');

// Mock require for stock service factory
jest.mock('../../services/vendor/api-client');
jest.mock('../../repositories/vendor-api-repository');
jest.mock('../../repositories/stock-token-repository');

// Mock schema validation
jest.mock('../../types/schemas/handlers', () => ({
  listPortfoliosParamsSchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: { userId: '123' }
    })
  },
  apiKeySchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
    })
  }
}));

describe('Portfolios List Handler', () => {
  // Setup mocks
  const mockGetInstance = jest.fn();
  const mockDatabaseService = {};
  const mockPortfolioRepository = {};
  const mockTransactionRepository = {};
  const mockUserRepository = {};
  const mockStockService = {};
  const mockPortfolioCacheService = {
    checkTableExists: jest.fn().mockResolvedValue(true)
  };
  const mockPortfolioService = {
    getUserPortfolioSummary: jest.fn()
  };
  
  // Set environment variables for testing
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Setup common mocks
    (DatabaseService.getInstance as jest.Mock).mockResolvedValue(mockDatabaseService);
    (PortfolioRepository as jest.Mock).mockImplementation(() => mockPortfolioRepository);
    (TransactionRepository as jest.Mock).mockImplementation(() => mockTransactionRepository);
    (UserRepository as jest.Mock).mockImplementation(() => mockUserRepository);
    (StockService as jest.Mock).mockImplementation(() => mockStockService);
    (PortfolioService as jest.Mock).mockImplementation(() => mockPortfolioService);
    (PortfolioCacheService as jest.Mock).mockImplementation(() => mockPortfolioCacheService);
    (DynamoDB.DocumentClient as jest.Mock).mockImplementation(() => ({}));
    
    // Mock getUserPortfolioSummary
    mockPortfolioService.getUserPortfolioSummary.mockResolvedValue({
      data: {
        totalValue: 1500,
        stocks: [
          { symbol: 'AAPL', quantity: 10, price: 150, value: 1500 }
        ]
      },
      fromCache: false,
      timestamp: '2023-05-15T12:00:00Z'
    });
    
    // Setup mock environment variables
    process.env = {
      ...originalEnv,
      DYNAMODB_REGION: 'test-region',
      DYNAMODB_ACCESS_KEY_ID: 'test-key',
      DYNAMODB_SECRET_ACCESS_KEY: 'test-secret',
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      PORTFOLIO_CACHE_TABLE: 'test-portfolio-cache'
    };
    
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  it('should return portfolio summary for valid user ID', async () => {
    // Create a mock event with valid path parameters
    const mockEvent = {
      pathParameters: { userId: '123' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    // Verify that services were initialized correctly
    expect(DatabaseService.getInstance).toHaveBeenCalled();
    expect(PortfolioRepository).toHaveBeenCalledWith(mockDatabaseService);
    expect(TransactionRepository).toHaveBeenCalledWith(mockDatabaseService);
    expect(UserRepository).toHaveBeenCalledWith(mockDatabaseService);
    
    // Verify that DynamoDB was initialized for cache
    expect(DynamoDB.DocumentClient).toHaveBeenCalledWith({
      region: 'test-region',
      credentials: {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      },
      endpoint: 'http://localhost:8000'
    });
    
    // Verify that PortfolioCacheService was initialized with correct table
    expect(PortfolioCacheService).toHaveBeenCalledWith(
      expect.any(Object),
      'test-portfolio-cache'
    );
    
    // Verify that portfolioService.getUserPortfolioSummary was called with userId
    expect(mockPortfolioService.getUserPortfolioSummary).toHaveBeenCalledWith('123');
    
    // Verify response body
    expect(body.status).toBe('success');
    expect(body.data).toEqual({
      totalValue: 1500,
      stocks: [
        { symbol: 'AAPL', quantity: 10, price: 150, value: 1500 }
      ]
    });
    expect(body.metadata).toEqual({
      cached: false,
      timestamp: '2023-05-15T12:00:00Z'
    });
  });
  
  it('should handle missing or invalid userId in path parameters', async () => {
    // Override the mock to return a validation error
    const { listPortfoliosParamsSchema } = require('../../types/schemas/handlers');
    (listPortfoliosParamsSchema.safeParse as jest.Mock).mockReturnValueOnce({
      success: false,
      error: new Error('Invalid userId')
    });
    
    // Mock error handler
    (handleZodError as jest.Mock).mockImplementationOnce(() => {
      throw { statusCode: 400, message: 'Invalid userId parameter' };
    });
    
    // Create a mock event with invalid path parameters
    const mockEvent = {
      pathParameters: { userId: 'invalid' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler - it should return an error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(500); // The wrapper converts all errors to 500 by default
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    
    // Verify that getUserPortfolioSummary was not called
    expect(mockPortfolioService.getUserPortfolioSummary).not.toHaveBeenCalled();
  });
  
  it('should handle errors from portfolio service', async () => {
    // Make the service throw an error
    mockPortfolioService.getUserPortfolioSummary.mockRejectedValue(
      new Error('Portfolio not found')
    );
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { userId: '123' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler - it should return an error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });
  
  it('should handle cache table verification failures gracefully', async () => {
    // Mock cache table check to fail
    mockPortfolioCacheService.checkTableExists.mockResolvedValueOnce(false);
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { userId: '123' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler (should still work even if cache check fails)
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(200);
    
    // Verify that getUserPortfolioSummary was still called
    expect(mockPortfolioService.getUserPortfolioSummary).toHaveBeenCalledWith('123');
  });
  
  it('should use default cache table name when not provided', async () => {
    // Remove the cache table environment variable
    delete process.env.PORTFOLIO_CACHE_TABLE;
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { userId: '123' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    await handler(mockEvent, {} as any, null as any);
    
    // Verify that PortfolioCacheService was initialized with default table name
    expect(PortfolioCacheService).toHaveBeenCalledWith(
      expect.any(Object),
      'fuse-portfolio-cache-local'
    );
  });
}); 