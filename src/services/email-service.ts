import { SendEmailCommandInput, SES } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';
import { EmailParams, EmailParamsChangeStockPrice } from '../types/models/shared';
import { IEmailService } from './types/email-service';
import { EmailRepository } from '../repositories/email-repository';

// Interfaces

/**
 * Servicio para el envío de emails
 * Soporta múltiples proveedores según el entorno (AWS SES o SMTP local)
 */
export class EmailService implements IEmailService {
  private ses: SES | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private readonly reportService: any; // ReportService
  private emailRepository: EmailRepository;

  constructor() {
    // Importamos dinámicamente para evitar dependencias circulares
    this.reportService = require('./report-service').ReportService.prototype;

    // Determinar el proveedor de email según el entorno
    const emailProvider =
      process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'ses' : 'smtp');

    if (emailProvider === 'ses') {
      this.initializeSES();
    } else {
      this.initializeSMTP();
    }

    this.emailRepository = new EmailRepository();
  }

  /**
   * Creates and initializes a new instance of EmailService
   * @returns Promise with initialized EmailService instance
   */
  public static async initialize(): Promise<EmailService> {
    const emailRepository = await EmailRepository.initialize();
    const service = new EmailService();
    service.emailRepository = emailRepository;
    return service;
  }

  /**
   * Inicializa el cliente de AWS SES
   */
  private initializeSES(): void {
    try {
      this.ses = new SES({
        region: process.env.AWS_REGION || 'us-east-1',

        // The key apiVersion is no longer supported in v3, and can be removed.
        // @deprecated The client uses the "latest" apiVersion.
        apiVersion: '2010-12-01',
      });
      console.log('AWS SES client initialized successfully');
    } catch (error) {
      console.error('Error initializing AWS SES client:', error);
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
   * @param params Parámetros del email
   */
  async sendReportEmail(params: EmailParams): Promise<void> {
    await this.emailRepository.sendReportEmail(params);
  }


  async notifyChangeStockPrice(params: EmailParamsChangeStockPrice): Promise<void> {
    await this.emailRepository.notifyChangeStockPrice(params);
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

    const params: SendEmailCommandInput = {
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
}
