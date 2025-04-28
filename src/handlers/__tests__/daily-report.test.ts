import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../cron/daily-report';
import { DatabaseService } from '../../config/database';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { ReportService } from '../../services/report-service';
import { EmailService } from '../../services/email-service';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../repositories/transaction-repository');
jest.mock('../../services/report-service');
jest.mock('../../services/email-service');

describe('Daily Report Handler', () => {
  // Setup mocks
  const mockGetInstance = jest.fn();
  const mockDatabaseService = {};
  const mockTransactionRepository = { findByDate: jest.fn() };
  const mockGenerateDailyReport = jest.fn();
  const mockSendReportEmail = jest.fn();
  const mockReportService = { generateDailyReport: mockGenerateDailyReport };
  const mockEmailService = { sendReportEmail: mockSendReportEmail };
  
  // Set environment variables for testing
  const originalEnv = process.env;
  
  beforeEach(() => {
    // Setup common mocks
    (DatabaseService.getInstance as jest.Mock).mockResolvedValue(mockDatabaseService);
    (TransactionRepository as jest.Mock).mockImplementation(() => mockTransactionRepository);
    (ReportService as jest.Mock).mockImplementation(() => mockReportService);
    (EmailService as jest.Mock).mockImplementation(() => mockEmailService);
    
    mockGenerateDailyReport.mockResolvedValue({
      date: '2023-01-01',
      totalTransactions: 5,
      summaryBySymbol: {}
    });
    
    mockSendReportEmail.mockResolvedValue(undefined);
    
    // Setup mock environment variables
    process.env = {
      ...originalEnv,
      REPORT_RECIPIENTS: 'test@example.com,admin@example.com',
    };
    
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });
  
  it('should generate and send report with default date (yesterday)', async () => {
    // Create a mock event without query parameters
    const mockEvent = {
      queryStringParameters: null
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    // Verify that generate report was called with yesterday's date
    expect(mockGenerateDailyReport).toHaveBeenCalled();
    const generateCallArg = mockGenerateDailyReport.mock.calls[0][0];
    
    // Get yesterday's date in YYYY-MM-DD format for comparison
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    expect(generateCallArg).toBe(yesterdayStr);
    
    // Verify email was sent with correct parameters
    expect(mockSendReportEmail).toHaveBeenCalledWith({
      recipients: ['test@example.com', 'admin@example.com'],
      subject: `Daily Transaction Report - ${yesterdayStr}`,
      reportData: expect.objectContaining({
        date: '2023-01-01'
      })
    });
    
    // Verify response body
    expect(body.message).toBe('Daily report generated and sent successfully');
    expect(body.date).toBe(yesterdayStr);
    expect(body.recipients).toEqual(['test@example.com', 'admin@example.com']);
  });
  
  it('should use date from query parameters when provided', async () => {
    // Create a mock event with query parameters
    const mockEvent = {
      queryStringParameters: {
        date: '2023-05-15'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Check response
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    // Verify that generate report was called with the specified date
    expect(mockGenerateDailyReport).toHaveBeenCalledWith('2023-05-15');
    
    // Verify email was sent with correct parameters
    expect(mockSendReportEmail).toHaveBeenCalledWith({
      recipients: ['test@example.com', 'admin@example.com'],
      subject: 'Daily Transaction Report - 2023-05-15',
      reportData: expect.any(Object)
    });
    
    // Verify response body
    expect(body.message).toBe('Daily report generated and sent successfully');
    expect(body.date).toBe('2023-05-15');
  });
  
  it('should use default recipient if none specified in environment', async () => {
    // Remove environment recipients
    delete process.env.REPORT_RECIPIENTS;
    
    // Create a mock event
    const mockEvent = {
      queryStringParameters: {
        date: '2023-05-15'
      }
    } as unknown as APIGatewayProxyEvent;
    
    // Call the handler
    await handler(mockEvent, {} as any, null as any);
    
    // Verify email was sent with default recipient
    expect(mockSendReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ['admin@example.com']
      })
    );
  });
  
  it('should return error response when error occurs', async () => {
    // Make the service throw an error
    mockGenerateDailyReport.mockRejectedValue(new Error('Database connection failed'));
    
    // Create a mock event
    const mockEvent = {} as APIGatewayProxyEvent;
    
    // Call the handler - it should be wrapped by the error handler now
    const result = await handler(mockEvent, {} as any, null as any);
    
    // Verify the error response
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('error');
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    
    // Verify email was not sent
    expect(mockSendReportEmail).not.toHaveBeenCalled();
  });
}); 