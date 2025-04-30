import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseService } from '../../config/database';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { ReportService } from '../../services/report-service';
import { EmailService } from '../../services/email-service';
import { IReportService, IEmailService } from '../../services/service-types';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { apiKeySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';

/**
 * Handler to generate and send daily transaction reports
 */
const dailyReportHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  console.log('Starting daily report generation...', {
    headers: event.headers ? {
      'x-api-key-exists': !!event.headers['x-api-key'],
      'X-API-Key-exists': !!event.headers['X-API-Key']
    } : 'No headers'
  });
  
  // Validate API key if this is an API Gateway event
  if (event.headers) {
    const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
    const apiKeyResult = apiKeySchema.safeParse(apiKey);
    
    if (!apiKeyResult.success) {
      throw handleZodError(apiKeyResult.error);
    }

    if (apiKey !== process.env.VENDOR_API_KEY) {
      throw new AuthenticationError('Invalid API key');
    }
  }

  try {
    // Initialize services
    const dbService = await DatabaseService.getInstance();
    const transactionRepository = new TransactionRepository(dbService);
    
    // Initialize report service
    const reportService: IReportService = new ReportService(transactionRepository);
    
    // Get date from event or use today as default
    let dateStr;
    
    if (event.queryStringParameters && event.queryStringParameters.date) {
      dateStr = event.queryStringParameters.date;
      console.log(`Using provided date: ${dateStr}`);
    } else {
      // Default to today's date if not specified
      const today = new Date();
      dateStr = today.toISOString().split('T')[0];
      console.log(`Using default date (today): ${dateStr}`);
    }
    
    console.log(`Generating report for date: ${dateStr}`);
    
    // Generate report
    const report = await reportService.generateDailyReport(dateStr);
    
    // Send by email
    const emailService: IEmailService = new EmailService();
    const recipients = process.env.REPORT_RECIPIENTS?.split(',') || ['admin@example.com'];
    
    await emailService.sendReportEmail({
      recipients,
      subject: `Daily Transaction Report - ${dateStr}`,
      reportData: report
    });
    
    const executionTime = Date.now() - startTime;
    console.log(`Daily report generated and sent in ${executionTime}ms`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily report generated and sent successfully',
        date: dateStr,
        recipients,
        executionTime
      })
    };
  } catch (error) {
    console.error('Error generating daily report:', error);
    throw error;
  }
};

export const handler = wrapHandler(dailyReportHandler); 