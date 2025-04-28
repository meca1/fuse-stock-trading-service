import * as AWS from 'aws-sdk';
import * as nodemailer from 'nodemailer';
import { ReportData } from './report-service';

// Interfaces
interface EmailParams {
  recipients: string[];
  subject: string;
  reportData: ReportData;
}

/**
 * Servicio para el envío de emails
 * Soporta múltiples proveedores según el entorno (AWS SES o SMTP local)
 */
export class EmailService {
  private ses: AWS.SES | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private readonly reportService: any; // ReportService
  
  constructor() {
    // Importamos dinámicamente para evitar dependencias circulares
    this.reportService = require('./report-service').ReportService.prototype;
    
    // Determinar el proveedor de email según el entorno
    const emailProvider = process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'ses' : 'smtp');
    
    if (emailProvider === 'ses') {
      this.initializeSES();
    } else {
      this.initializeSMTP();
    }
  }
  
  /**
   * Inicializa el cliente de AWS SES
   */
  private initializeSES(): void {
    try {
      this.ses = new AWS.SES({
        region: process.env.AWS_REGION || 'us-east-1',
        apiVersion: '2010-12-01'
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
        auth: process.env.SMTP_AUTH === 'true' ? {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASSWORD || ''
        } : undefined
      });
      
      console.log(`SMTP client initialized for ${process.env.SMTP_HOST || 'localhost'}:${process.env.SMTP_PORT || 1025}`);
    } catch (error) {
      console.error('Error initializing SMTP client:', error);
    }
  }
  
  /**
   * Envía un email con el reporte diario
   * @param params Parámetros del email
   */
  async sendReportEmail(params: EmailParams): Promise<void> {
    const { recipients, subject, reportData } = params;
    
    // Generar HTML del reporte
    const htmlContent = this.reportService.formatReportAsHtml(reportData);
    
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
  private async sendWithSES(recipients: string[], subject: string, htmlContent: string): Promise<void> {
    if (!this.ses) {
      throw new Error('Cliente SES no inicializado');
    }
    
    const params: AWS.SES.SendEmailRequest = {
      Source: process.env.EMAIL_SENDER || 'reports@example.com',
      Destination: {
        ToAddresses: recipients
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8'
          }
        }
      }
    };
    
    await this.ses.sendEmail(params).promise();
  }
  
  /**
   * Envía un email usando SMTP (nodemailer)
   */
  private async sendWithSMTP(recipients: string[], subject: string, htmlContent: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('Transportador SMTP no inicializado');
    }
    
    const mailOptions = {
      from: process.env.EMAIL_SENDER || 'reports@localhost',
      to: recipients.join(', '),
      subject,
      html: htmlContent
    };
    
    await this.transporter.sendMail(mailOptions);
  }
} 