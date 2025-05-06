/**
 * Tipos de transacciones
 */
export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL'
}

/**
 * Estados de transacciones
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
} 