/**
 * Tipos para la API del proveedor de stocks
 */

// Tipo para un stock individual
export interface VendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange: string;
  industry?: string;
  timestamp: string; // ISO date string
}

// Respuesta de la API para listar stocks
export interface ListStocksResponse {
  status: number;
  data: {
    items: VendorStock[];
    nextToken?: string;
  };
}

// Parámetros para comprar un stock
export interface BuyStockParams {
  price: number;
  quantity: number;
}

// Respuesta de la API para comprar un stock
export interface BuyStockResponse {
  status: number;
  data: {
    transactionId: string;
    symbol: string;
    price: number;
    quantity: number;
    timestamp: string; // ISO date string
  };
}

// Error de la API
export interface VendorApiError {
  status: number;
  message: string;
  code?: string;
}
