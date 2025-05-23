/**
 * Tipos para la API del proveedor de stocks
 */

// Tipo para un stock individual
export interface VendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange?: string;
  industry?: string;
  timestamp?: string;
  pageToken?: string;
}

// Respuesta de la API para listar stocks
export interface ListStocksResponse {
  status: number;
  data: {
    items: VendorStock[];
    nextToken: string;
  };
}

// Parámetros para comprar un stock según la API del vendor
export interface BuyStockParams {
  price: number;
  quantity: number;
}

// Respuesta de la API para comprar un stock
export interface BuyStockResponse {
  status: number;
  message: string;
  data?: {
    order?: {
      symbol: string;
      quantity: number;
      price: number;
      total: number;
    };
  };
}

// Error de la API
export interface VendorApiError {
  status: number;
  message: string;
  code?: string;
}
