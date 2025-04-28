import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DatabaseService } from '../../config/database';
// Importamos solo los tipos
import { IReportService, IEmailService } from '../../services/service-types';
// Importamos las implementaciones con @ts-ignore
// @ts-ignore
import { ReportService } from '../../services/report-service';
// @ts-ignore
import { EmailService } from '../../services/email-service';
import { TransactionRepository } from '../../repositories/transaction-repository';
import { wrapHandler } from '../../middleware/lambda-error-handler';

/**
 * Handler para generar y enviar reportes diarios de transacciones
 */
const dailyReportHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Iniciando generación de reporte diario...');
  const startTime = Date.now();

  try {
    // Inicializar servicios
    const dbService = await DatabaseService.getInstance();
    const transactionRepository = new TransactionRepository(dbService);
    
    // Inicializar servicio de reportes
    const reportService: IReportService = new ReportService(transactionRepository);
    
    // Obtener fecha del parámetro o usar ayer como valor predeterminado
    let dateStr;
    
    if (event.queryStringParameters && event.queryStringParameters.date) {
      dateStr = event.queryStringParameters.date;
      console.log(`Usando fecha proporcionada: ${dateStr}`);
    } else {
      // Por defecto, usamos ayer
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
      console.log(`Usando fecha predeterminada (ayer): ${dateStr}`);
    }
    
    console.log(`Generando reporte para la fecha: ${dateStr}`);
    
    // Generar reporte
    const report = await reportService.generateDailyReport(dateStr);
    
    // Enviar por email
    const emailService: IEmailService = new EmailService();
    const recipients = process.env.REPORT_RECIPIENTS?.split(',') || ['admin@example.com'];
    
    await emailService.sendReportEmail({
      recipients,
      subject: `Reporte Diario de Transacciones - ${dateStr}`,
      reportData: report
    });
    
    const executionTime = Date.now() - startTime;
    console.log(`Reporte diario generado y enviado en ${executionTime}ms`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Reporte diario generado y enviado correctamente',
        date: dateStr,
        recipients,
        executionTime: `${executionTime}ms`,
        summary: {
          totalTransactions: report.totalTransactions,
          successfulTransactions: report.successfulTransactions.length,
          failedTransactions: report.failedTransactions.length
        }
      })
    };
  } catch (error) {
    console.error('Error al generar el reporte diario:', error);
    throw error;
  }
};

export const handler = wrapHandler(dailyReportHandler); 