import { ReportData } from '../models/shared';

/**
 * Interface for report service
 */
export interface IReportService {
  generateDailyReport(date: string): Promise<ReportData>;
  formatReportAsHtml(reportData: ReportData): string;
} 