import { TransactionRepository } from '../repositories/transaction-repository';
import { ITransaction } from '../types/models/transaction';
import { TransactionStatus } from '../types/common/enums';

/**
 * Interfaz para los datos del reporte
 */
export interface ReportData {
  date: string;
  totalTransactions: number;
  successfulTransactions: ITransaction[];
  failedTransactions: ITransaction[];
  summaryBySymbol: {
    [symbol: string]: {
      total: number;
      successful: number;
      failed: number;
      totalAmount: number;
    }
  };
  totals: {
    successfulAmount: number;
    failedAmount: number;
    totalAmount: number;
  };
}

/**
 * Servicio para la generación de reportes de transacciones
 */
export class ReportService {
  constructor(private readonly transactionRepository: TransactionRepository) {}
  
  /**
   * Genera un reporte diario de transacciones para una fecha específica
   * @param date Fecha en formato YYYY-MM-DD
   * @returns Datos del reporte
   */
  async generateDailyReport(date: string): Promise<ReportData> {
    try {
      // Obtener todas las transacciones para la fecha especificada
      const transactions = await this.transactionRepository.findByDate(date);
      
      // Separar transacciones exitosas y fallidas
      const successfulTransactions = transactions.filter(
        t => t.status === TransactionStatus.COMPLETED
      );
      
      const failedTransactions = transactions.filter(
        t => t.status === TransactionStatus.FAILED
      );
      
      // Generar resumen por símbolo
      const summaryBySymbol: ReportData['summaryBySymbol'] = {};
      
      // Inicializar totales
      let successfulAmount = 0;
      let failedAmount = 0;
      
      // Procesar cada transacción para el resumen
      transactions.forEach(transaction => {
        const symbol = transaction.stock_symbol;
        const amount = transaction.quantity * transaction.price;
        const isSuccessful = transaction.status === TransactionStatus.COMPLETED;
        
        // Actualizar totales
        if (isSuccessful) {
          successfulAmount += amount;
        } else {
          failedAmount += amount;
        }
        
        // Inicializar el resumen del símbolo si no existe
        if (!summaryBySymbol[symbol]) {
          summaryBySymbol[symbol] = {
            total: 0,
            successful: 0,
            failed: 0,
            totalAmount: 0
          };
        }
        
        // Actualizar resumen del símbolo
        const symbolSummary = summaryBySymbol[symbol];
        symbolSummary.total += 1;
        symbolSummary.totalAmount += amount;
        
        if (isSuccessful) {
          symbolSummary.successful += 1;
        } else {
          symbolSummary.failed += 1;
        }
      });
      
      // Generar resumen final
      return {
        date,
        totalTransactions: transactions.length,
        successfulTransactions,
        failedTransactions,
        summaryBySymbol,
        totals: {
          successfulAmount,
          failedAmount,
          totalAmount: successfulAmount + failedAmount
        }
      };
    } catch (error) {
      console.error(`Error generando reporte para ${date}:`, error);
      throw error;
    }
  }
  
  /**
   * Formatea los datos del reporte como HTML para enviarlos por email
   * @param reportData Datos del reporte
   * @returns HTML formateado
   */
  formatReportAsHtml(reportData: ReportData): string {
    const { date, totalTransactions, successfulTransactions, failedTransactions, summaryBySymbol, totals } = reportData;
    
    // Generar filas para la tabla de resumen por símbolo
    const symbolRows = Object.entries(summaryBySymbol)
      .map(([symbol, data]) => {
        const successRate = data.total > 0 ? Math.round((data.successful / data.total) * 100) : 0;
        return `
          <tr>
            <td>${symbol}</td>
            <td>${data.total}</td>
            <td>${data.successful}</td>
            <td>${data.failed}</td>
            <td>${successRate}%</td>
            <td>$${data.totalAmount.toFixed(2)}</td>
          </tr>
        `;
      })
      .join('');
    
    // Tabla de transacciones fallidas
    const failedRows = failedTransactions
      .map(t => {
        return `
          <tr>
            <td>${t.id}</td>
            <td>${t.stock_symbol}</td>
            <td>${t.quantity}</td>
            <td>$${t.price}</td>
            <td>$${(t.quantity * t.price).toFixed(2)}</td>
            <td>${t.notes || 'Sin detalles'}</td>
          </tr>
        `;
      })
      .join('');
    
    // Generar HTML completo
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { margin-bottom: 20px; }
          .success { color: green; }
          .failure { color: red; }
          h2 { color: #333; }
        </style>
      </head>
      <body>
        <h1>Reporte Diario de Transacciones - ${date}</h1>
        
        <div class="summary">
          <h2>Resumen</h2>
          <p>Total de transacciones: <strong>${totalTransactions}</strong></p>
          <p>Transacciones exitosas: <strong class="success">${successfulTransactions.length}</strong></p>
          <p>Transacciones fallidas: <strong class="failure">${failedTransactions.length}</strong></p>
          <p>Monto total procesado: <strong>$${totals.totalAmount.toFixed(2)}</strong></p>
          <p>Monto de transacciones exitosas: <strong class="success">$${totals.successfulAmount.toFixed(2)}</strong></p>
          <p>Monto de transacciones fallidas: <strong class="failure">$${totals.failedAmount.toFixed(2)}</strong></p>
        </div>
        
        <h2>Resumen por Símbolo</h2>
        <table>
          <thead>
            <tr>
              <th>Símbolo</th>
              <th>Total</th>
              <th>Exitosas</th>
              <th>Fallidas</th>
              <th>Tasa de Éxito</th>
              <th>Monto Total</th>
            </tr>
          </thead>
          <tbody>
            ${symbolRows}
          </tbody>
        </table>
        
        <h2>Transacciones Fallidas</h2>
        ${failedTransactions.length === 0 ? '<p>No hay transacciones fallidas para esta fecha.</p>' : `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Símbolo</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Total</th>
              <th>Razón del Fallo</th>
            </tr>
          </thead>
          <tbody>
            ${failedRows}
          </tbody>
        </table>
        `}
        
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
          Este es un reporte generado automáticamente. No responda a este correo.
        </p>
      </body>
      </html>
    `;
  }
} 