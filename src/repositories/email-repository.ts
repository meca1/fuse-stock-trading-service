import { SES } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';
import { EmailParams, EmailParamsChangeStockPrice, ReportDataNotifyChangeStockPrice } from '../types/models/shared';
import { CacheService } from '../services/cache-service';
import { ITransaction } from '../types/models/transaction';

interface DailyReport {
  date: string;
  totalTransactions: number;
  successfulTransactions: ITransaction[];
  failedTransactions: (ITransaction & { error?: string })[];
  summaryBySymbol: {
    [key: string]: {
      total: number;
      successful: number;
      failed: number;
      totalAmount: number;
    };
  };
  totals: {
    successfulAmount: number;
    failedAmount: number;
    totalAmount: number;
  };
}

export class EmailRepository {
  private ses: SES | null = null;
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    // Determinar el proveedor de email según el entorno
    const emailProvider =
      process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'ses' : 'smtp');

    if (emailProvider === 'ses') {
      this.initializeSES();
    } else {
      this.initializeSMTP();
    }
  }

  /**
   * Creates and initializes a new instance of EmailRepository
   * @returns Promise with initialized EmailRepository instance
   */
  public static async initialize(): Promise<EmailRepository> {
    return new EmailRepository();
  }

  /**
   * Inicializa el cliente de AWS SES
   */
  private initializeSES(): void {
    try {
      this.ses = new SES({
        region: process.env.AWS_REGION || 'us-east-1',
        apiVersion: '2010-12-01',
      });
      console.log('AWS SES client initialized successfully');
    } catch (error) {
      console.error('Error initializing AWS SES client:', error);
    }
  }

  public async notifyChangeStockPrice(params: EmailParamsChangeStockPrice): Promise<void> {
    const { recipients, subject, reportData } = params;

    // Generar HTML del reporte
    const htmlContent = this.notifyChangeStockPriceAsHtml(reportData);

    console.log('htmlContent', htmlContent);
    try {
      if (this.ses) {
        // Enviar con AWS SES
        await this.sendWithSES(recipients, subject, htmlContent);
      } else if (this.transporter) {
        // Enviar con SMTP
        await this.sendWithSMTP(recipients, subject, htmlContent);
      } else {
        throw new Error('No email provider has been initialized');
      }

      console.log(`Report successfully sent to ${recipients.join(', ')}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Inicializa el transporter SMTP para entorno local
   */
  private initializeSMTP(): void {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT) || 1025,
        secure: false,
        auth:
          process.env.SMTP_AUTH === 'true'
            ? {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASSWORD || '',
              }
            : undefined,
      });

      console.log(
        `SMTP client initialized for ${process.env.SMTP_HOST || 'localhost'}:${process.env.SMTP_PORT || 1025}`,
      );
    } catch (error) {
      console.error('Error initializing SMTP client:', error);
    }
  }

  /**
   * Envía un email con el reporte diario
   */
  async sendReportEmail(params: EmailParams): Promise<void> {
    const { recipients, subject, reportData } = params;

    // Generar HTML del reporte
    const htmlContent = this.formatReportAsHtml(reportData);

    try {
      if (this.ses) {
        // Enviar con AWS SES
        await this.sendWithSES(recipients, subject, htmlContent);
      } else if (this.transporter) {
        // Enviar con SMTP
        await this.sendWithSMTP(recipients, subject, htmlContent);
      } else {
        throw new Error('No email provider has been initialized');
      }

      console.log(`Report successfully sent to ${recipients.join(', ')}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Envía un email usando AWS SES
   */
  private async sendWithSES(
    recipients: string[],
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    if (!this.ses) {
      throw new Error('Cliente SES no inicializado');
    }

    const params = {
      Source: process.env.EMAIL_SENDER || 'reports@example.com',
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8',
          },
        },
      },
    };

    await this.ses.sendEmail(params);
  }

  /**
   * Envía un email usando SMTP (nodemailer)
   */
  private async sendWithSMTP(
    recipients: string[],
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('Transportador SMTP no inicializado');
    }

    const mailOptions = {
      from: process.env.EMAIL_SENDER || 'reports@localhost',
      to: recipients.join(', '),
      subject,
      html: htmlContent,
    };

    await this.transporter.sendMail(mailOptions);
  }

  private notifyChangeStockPriceAsHtml(reportData: ReportDataNotifyChangeStockPrice): string {
    return `
      <h1>Stock price change notification</h1>
      <p>The stock ${reportData.symbol} has a price change of ${reportData.priceDiff} from ${reportData.currentPrice} to ${reportData.minPrice} and ${reportData.maxPrice}</p>
    `;
  }

  /**
   * Formats the report data as HTML
   */
  private formatReportAsHtml(report: DailyReport): string {
    const formatDate = (date: string) => new Date(date).toLocaleString();
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
            .section { margin-bottom: 30px; }
            .section-title { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f8f9fa; }
            .success { color: #28a745; }
            .error { color: #dc3545; }
            .summary-box { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .summary-item { margin-bottom: 10px; }
            .summary-label { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Daily Trading Report</h1>
              <p>Date: ${formatDate(report.date)}</p>
            </div>

            <div class="section">
              <h2 class="section-title">Summary</h2>
              <div class="summary-box">
                <div class="summary-item">
                  <span class="summary-label">Total Transactions:</span> ${report.totalTransactions}
                </div>
                <div class="summary-item">
                  <span class="summary-label">Successful Transactions:</span> ${report.successfulTransactions.length}
                </div>
                <div class="summary-item">
                  <span class="summary-label">Failed Transactions:</span> ${report.failedTransactions.length}
                </div>
                <div class="summary-item">
                  <span class="summary-label">Total Amount:</span> ${formatCurrency(report.totals.totalAmount)}
                </div>
              </div>
            </div>

            <div class="section">
              <h2 class="section-title">Transactions by Symbol</h2>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Total Transactions</th>
                    <th>Successful</th>
                    <th>Failed</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(report.summaryBySymbol)
                    .map(
                      ([symbol, data]) => `
                    <tr>
                      <td>${symbol}</td>
                      <td>${data.total}</td>
                      <td class="success">${data.successful}</td>
                      <td class="error">${data.failed}</td>
                      <td>${formatCurrency(data.totalAmount)}</td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <h2 class="section-title">Successful Transactions</h2>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${report.successfulTransactions
                    .map(
                      (tx) => `
                    <tr>
                      <td>${tx.id}</td>
                      <td>${tx.stock_symbol}</td>
                      <td>${tx.type}</td>
                      <td>${tx.quantity}</td>
                      <td>${formatCurrency(Number(tx.price))}</td>
                      <td>${formatDate(tx.date)}</td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>

            ${report.failedTransactions.length > 0 ? `
              <div class="section">
                <h2 class="section-title">Failed Transactions</h2>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Date</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${report.failedTransactions
                      .map(
                        (tx) => `
                      <tr>
                        <td>${tx.id}</td>
                        <td>${tx.stock_symbol}</td>
                        <td>${tx.type}</td>
                        <td>${tx.quantity}</td>
                        <td>${formatCurrency(Number(tx.price))}</td>
                        <td>${formatDate(tx.date)}</td>
                        <td class="error">${tx.error || 'Unknown error'}</td>
                      </tr>
                    `,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>
        </body>
      </html>
    `;
  }
} 


