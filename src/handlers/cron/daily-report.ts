import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseService } from '../../config/database';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { ReportService } from '../../services/report-service';
import { EmailService } from '../../services/email-service';
import { IReportService } from '../../types/services/report-service';
import { IEmailService } from '../../types/services/email-service';
import { ReportData } from '../../types/models/shared';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AuthenticationError } from '../../utils/errors/app-error';
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
    const dateStr = event.queryStringParameters?.date || new Date().toISOString().split('T')[0];
    console.log(`Generating report for date: ${dateStr}`);
    
    // Generate report
    const report: ReportData = await reportService.generateDailyReport(dateStr);
    
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
        executionTime,
        reportSummary: {
          totalTransactions: report.totalTransactions,
          successfulTransactions: report.successfulTransactions.length,
          failedTransactions: report.failedTransactions.length,
          totalAmount: report.totals.totalAmount
        }
      })
    };
  } catch (error) {
    console.error('Error generating daily report:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while generating the daily report');
  }
};

export const handler = wrapHandler(dailyReportHandler); 