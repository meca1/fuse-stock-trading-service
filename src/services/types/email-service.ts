import { EmailParams, EmailParamsChangeStockPrice } from '../models/shared';

/**
 * Interface for email service
 */
export interface IEmailService {
  sendReportEmail(params: EmailParams): Promise<void>;
  notifyChangeStockPrice(params: EmailParamsChangeStockPrice): Promise<void>;
}
