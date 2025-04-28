import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseService } from '../../config/database';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { ReportService } from '../../services/report-service';
import { EmailService } from '../../services/email-service';
import { IReportService, IEmailService } from '../../services/service-types';
import { wrapHandler } from '../../middleware/lambda-error-handler';

/**
 * Handler to generate and send daily transaction reports
 */
const dailyReportHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  console.log('Starting daily report generation...');

  try {
    // Initialize services
    const dbService = await DatabaseService.getInstance();
    const transactionRepository = new TransactionRepository(dbService);
    
    // Initialize report service
    const reportService: IReportService = new ReportService(transactionRepository);
    
    // Get date from event or use yesterday as default
    let dateStr;
    
    if (event.queryStringParameters && event.queryStringParameters.date) {
      dateStr = event.queryStringParameters.date;
      console.log(`Using provided date: ${dateStr}`);
    } else {
      // Default to yesterday's date if not specified
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
      console.log(`Using default date (yesterday): ${dateStr}`);
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