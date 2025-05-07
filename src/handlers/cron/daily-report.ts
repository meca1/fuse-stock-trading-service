import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';

// Services
import { ReportService } from '../../services/report-service';
import { EmailService } from '../../services/email-service';

// Middleware
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';
import { createResponseValidator } from '../../middleware/response-validator';

// Schemas
import { dailyReportQuerySchema } from '../../types/schemas/handlers';
import { dailyReportResponseSchema } from '../../types/schemas/responses';

// Constants
import { HTTP_HEADERS, HTTP_STATUS } from '../../constants/http';

/**
 * Handler to generate and send daily transaction reports
 */
const dailyReportHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const dateStr = event.queryStringParameters?.date || new Date().toISOString().split('T')[0];
  
  // Initialize services
  const reportService = await ReportService.initialize();
  const emailService = await EmailService.initialize();
  
  // Generate report
  const report = await reportService.generateDailyReport(dateStr);
  
  // Send by email
  const recipients = process.env.REPORT_RECIPIENTS?.split(',') || ['admin@example.com'];
  await emailService.sendReportEmail({
    recipients,
    subject: `Daily Transaction Report - ${dateStr}`,
    reportData: report
  });
  
  const executionTime = Date.now() - startTime;
  
  return {
    statusCode: HTTP_STATUS.OK,
    headers: HTTP_HEADERS,
    body: JSON.stringify({
      status: 'success',
      data: {
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
      }
    })
  };
};

// Export the handler wrapped with Middy middleware
export const handler = middy(dailyReportHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(dailyReportQuerySchema))
  .use(httpErrorHandler())
  .use(createResponseValidator(dailyReportResponseSchema)); 