import { EmailParams, EmailParamsChangeStockPrice } from '../../types/models/shared';

/**
 * Interface for email service
 */
export interface IEmailService {
  sendReportEmail(params: EmailParams): Promise<void>;
  notifyChangeStockPrice(params: EmailParamsChangeStockPrice): Promise<void>;
}
