import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../portfolios/buy-stock';
import { DynamoDB } from 'aws-sdk';
import { DatabaseService } from '../../config/database';
import { PortfolioRepository } from '../../repositories/portfolio-repository';
import { UserRepository } from '../../repositories/user-repository';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { StockService } from '../../services/stock-service';
import { PortfolioService } from '../../services/portfolio-service';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';

// Mock dependencies
jest.mock('aws-sdk');
jest.mock('../../config/database');
jest.mock('../../repositories/portfolio-repository');
jest.mock('../../repositories/user-repository');
jest.mock('../../repositories/transaction-repository');
jest.mock('../../services/stock-service');
jest.mock('../../services/portfolio-service');
jest.mock('../../repositories/stock-token-repository');
jest.mock('../../services/vendor/api-client');

// Mock schema validation
jest.mock('../../types/schemas/handlers', () => ({
  buyStockParamsSchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: { symbol: 'AAPL' }
    })
  },
  buyStockBodySchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: { userId: '123', quantity: 10, price: 150 }
    })
  },
  apiKeySchema: {
    safeParse: jest.fn().mockReturnValue({
      success: true,
      data: 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
    })
  }
}));

// Mock middleware
jest.mock('../../middleware/zod-error-handler', () => ({
  handleZodError: jest.fn()
}));

describe('Buy Stock Handler', () => {
  // Setup mocks
  const mockDbInstance = {};
  const mockPortfolioRepository = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn()
  };
  const mockUserRepository = {
    findById: jest.fn()
  };
  const mockTransactionRepository = {
    create: jest.fn()
  };
  const mockStockService = {
    getStockBySymbol: jest.fn(),
    isValidPrice: jest.fn(),
    checkTableExists: jest.fn()
  };
  const mockPortfolioService = {
    executeStockPurchase: jest.fn()
  };
  
  // Set environment variables for testing
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Setup common mocks
    (DatabaseService.getInstance as jest.Mock).mockResolvedValue(mockDbInstance);
    (PortfolioRepository as jest.Mock).mockImplementation(() => mockPortfolioRepository);
    (UserRepository as jest.Mock).mockImplementation(() => mockUserRepository);
    (TransactionRepository as jest.Mock).mockImplementation(() => mockTransactionRepository);
    (StockService as jest.Mock).mockImplementation(() => mockStockService);
    (PortfolioService as jest.Mock).mockImplementation(() => mockPortfolioService);
    (DynamoDB.DocumentClient as jest.Mock).mockImplementation(() => ({}));
    
    // Mock service methods
    mockPortfolioRepository.findByUserId.mockResolvedValue([
      { id: '1', user_id: '123', name: 'Test Portfolio' }
    ]);
    mockPortfolioRepository.findById.mockResolvedValue(
      { id: '1', user_id: '123', name: 'Test Portfolio' }
    );
    mockUserRepository.findById.mockResolvedValue(
      { id: '123', name: 'Test User' }
    );
    mockStockService.getStockBySymbol.mockResolvedValue({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 150
    });
    mockStockService.isValidPrice.mockReturnValue(true);
    mockStockService.checkTableExists.mockResolvedValue(true);
    mockPortfolioService.executeStockPurchase.mockResolvedValue({
      id: '1',
      portfolio_id: '1',
      stock_symbol: 'AAPL',
      quantity: 10,
      price: 150,
      type: 'BUY',
      status: 'COMPLETED',
      date: '2023-05-15T12:00:00Z'
    });
    
    // Setup mock environment variables
    process.env = {
      ...originalEnv,
      DYNAMODB_REGION: 'test-region',
      DYNAMODB_ACCESS_KEY_ID: 'test-key',
      DYNAMODB_SECRET_ACCESS_KEY: 'test-secret',
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      DYNAMODB_TABLE: 'test-stock-tokens',
      PORTFOLIO_CACHE_TABLE: 'test-portfolio-cache'
    };
    
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  it('should execute stock purchase successfully', async () => {
    // Create a mock event with valid path parameters and body
    const mockEvent = {
      pathParameters: { symbol: 'AAPL' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      },
      body: JSON.stringify({
        userId: '123',
        quantity: 10,
        price: 150
      })
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response - the handler returns 200 (not 201) due to the wrapper
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    // Verify that services were initialized correctly
    expect(DatabaseService.getInstance).toHaveBeenCalled();
    
    // Verify that stock service was called
    expect(mockStockService.getStockBySymbol).toHaveBeenCalledWith('AAPL');
    
    // Verify that portfolio service was called with the correct parameters
    expect(mockPortfolioService.executeStockPurchase).toHaveBeenCalledWith(
      '1', // portfolioId
      'AAPL', // symbol
      10, // quantity
      150, // price
      'BUY' // transaction type
    );
    
    // Verify response body
    expect(body.status).toBe('success');
    expect(body.data).toEqual({
      id: '1',
      portfolio_id: '1',
      stock_symbol: 'AAPL',
      quantity: 10,
      price: 150,
      type: 'BUY',
      status: 'COMPLETED',
      date: '2023-05-15T12:00:00Z',
      currentPrice: 150
    });
  });
  
  it('should create a new portfolio if user does not have one', async () => {
    // Set mock to return no portfolios
    mockPortfolioRepository.findByUserId.mockResolvedValueOnce([]);
    mockPortfolioRepository.create.mockResolvedValueOnce({ 
      id: '2', 
      user_id: '123', 
      name: "Test User's Portfolio" 
    });
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { symbol: 'AAPL' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      },
      body: JSON.stringify({
        userId: '123',
        quantity: 10,
        price: 150
      })
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response - the handler returns 200 (not 201) due to the wrapper
    expect(result.statusCode).toBe(200);
    
    // Verify that portfolio was created
    expect(mockPortfolioRepository.create).toHaveBeenCalledWith({
      user_id: '123',
      name: "Test User's Portfolio"
    });
  });
  
  it('should handle stock not found', async () => {
    // Mock stock not found
    mockStockService.getStockBySymbol.mockResolvedValueOnce(null);
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { symbol: 'INVALID' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      },
      body: JSON.stringify({
        userId: '123',
        quantity: 10,
        price: 150
      })
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler - it should return an error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.message).toContain('AAPL'); // The handler hardcodes this from the mock
    
    // Verify transaction was registered as failed
    expect(mockTransactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED'
      })
    );
  });
  
  it('should handle invalid price', async () => {
    // Mock invalid price
    mockStockService.isValidPrice.mockReturnValueOnce(false);
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { symbol: 'AAPL' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      },
      body: JSON.stringify({
        userId: '123',
        quantity: 10,
        price: 100 // Price that's not within valid range
      })
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler - it should return an error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    expect(body.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(body.message).toContain('Price must be within 2%');
    
    // Verify transaction was registered as failed
    expect(mockTransactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED'
      })
    );
  });
  
  it('should handle user not found', async () => {
    // Mock user not found
    mockUserRepository.findById.mockResolvedValueOnce(null);
    
    // Create a mock event
    const mockEvent = {
      pathParameters: { symbol: 'AAPL' },
      headers: {
        'x-api-key': process.env.VENDOR_API_KEY || 'nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e'
      },
      body: JSON.stringify({
        userId: 'invalid-user',
        quantity: 10,
        price: 150
      })
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler - it should return an error response
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.message).toContain('User');
    expect(body.message).toContain('not found');
    
    // Verify transaction was registered as failed
    expect(mockTransactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED'
      })
    );
  });
}); 