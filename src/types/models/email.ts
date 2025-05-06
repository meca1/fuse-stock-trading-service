import { ReportData } from './report';

/**
 * Parameters for sending an email
 */
export interface EmailParams {
  recipients: string[];
  subject: string;
  reportData: ReportData;
}

/**
 * Interface for the email service
 */
export interface IEmailService {
  sendReportEmail(params: EmailParams): Promise<void>;
} 