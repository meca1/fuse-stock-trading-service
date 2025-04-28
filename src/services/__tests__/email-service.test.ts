import { EmailService } from '../email-service';
import { ReportData } from '../service-types';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  return {
    SES: jest.fn().mockImplementation(() => ({
      sendEmail: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      })
    }))
  };
});

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockImplementation((mailOptions) => Promise.resolve({ mailOptions }))
  })
}));

// Mock ReportService to avoid circular dependencies
jest.mock('../report-service', () => ({
  ReportService: {
    prototype: {
      formatReportAsHtml: jest.fn().mockReturnValue('<html>Test Report</html>')
    }
  }
}));

describe('EmailService', () => {
  let emailService: EmailService;
  const mockReportData: ReportData = {
    date: '2025-04-28',
    totalTransactions: 10,
    successfulTransactions: [],
    failedTransactions: [],
    summaryBySymbol: {},
    totals: {
      successfulAmount: 1000,
      failedAmount: 200,
      totalAmount: 1200
    }
  };

  beforeEach(() => {
    // Clear all environment variables before each test
    process.env.EMAIL_PROVIDER = '';
    process.env.NODE_ENV = 'test';
    process.env.AWS_REGION = 'us-east-1';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_AUTH = 'false';
    process.env.EMAIL_SENDER = 'test@example.com';
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with SES in production environment', () => {
      process.env.NODE_ENV = 'production';
      emailService = new EmailService();
      expect(emailService['ses']).not.toBeNull();
      expect(emailService['transporter']).toBeNull();
    });

    it('should initialize with SMTP in non-production environment', () => {
      process.env.NODE_ENV = 'development';
      emailService = new EmailService();
      expect(emailService['ses']).toBeNull();
      expect(emailService['transporter']).not.toBeNull();
    });

    it('should respect EMAIL_PROVIDER environment variable', () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'smtp';
      emailService = new EmailService();
      expect(emailService['ses']).toBeNull();
      expect(emailService['transporter']).not.toBeNull();
    });
  });

  describe('sendReportEmail', () => {
    it('should send email with SES when SES is initialized', async () => {
      process.env.EMAIL_PROVIDER = 'ses';
      emailService = new EmailService();
      const sendWithSESSpy = jest.spyOn(emailService as any, 'sendWithSES').mockResolvedValue(undefined);
      
      await emailService.sendReportEmail({
        recipients: ['user@example.com'],
        subject: 'Test Report',
        reportData: mockReportData
      });
      
      expect(sendWithSESSpy).toHaveBeenCalledWith(
        ['user@example.com'], 
        'Test Report', 
        '<html>Test Report</html>'
      );
    });

    it('should send email with SMTP when SMTP is initialized', async () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      emailService = new EmailService();
      const sendWithSMTPSpy = jest.spyOn(emailService as any, 'sendWithSMTP').mockResolvedValue(undefined);
      
      await emailService.sendReportEmail({
        recipients: ['user@example.com'],
        subject: 'Test Report',
        reportData: mockReportData
      });
      
      expect(sendWithSMTPSpy).toHaveBeenCalledWith(
        ['user@example.com'], 
        'Test Report', 
        '<html>Test Report</html>'
      );
    });

    it('should throw error when no email provider is initialized', async () => {
      // Create a service with both providers null
      emailService = new EmailService();
      emailService['ses'] = null;
      emailService['transporter'] = null;
      
      await expect(emailService.sendReportEmail({
        recipients: ['user@example.com'],
        subject: 'Test Report',
        reportData: mockReportData
      })).rejects.toThrow('No email provider has been initialized');
    });

    it('should handle errors during email sending', async () => {
      process.env.EMAIL_PROVIDER = 'ses';
      emailService = new EmailService();
      jest.spyOn(emailService as any, 'sendWithSES').mockRejectedValue(new Error('SES error'));
      
      await expect(emailService.sendReportEmail({
        recipients: ['user@example.com'],
        subject: 'Test Report',
        reportData: mockReportData
      })).rejects.toThrow('SES error');
    });
  });

  describe('sendWithSES', () => {
    it('should throw error when SES is not initialized', async () => {
      emailService = new EmailService();
      emailService['ses'] = null;
      
      await expect((emailService as any).sendWithSES(
        ['user@example.com'], 
        'Test Subject', 
        '<html>Test</html>'
      )).rejects.toThrow('Cliente SES no inicializado');
    });
  });

  describe('sendWithSMTP', () => {
    it('should throw error when SMTP transporter is not initialized', async () => {
      emailService = new EmailService();
      emailService['transporter'] = null;
      
      await expect((emailService as any).sendWithSMTP(
        ['user@example.com'], 
        'Test Subject', 
        '<html>Test</html>'
      )).rejects.toThrow('Transportador SMTP no inicializado');
    });
  });
});
