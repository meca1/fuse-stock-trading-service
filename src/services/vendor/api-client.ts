import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { ListStocksResponse, BuyStockParams, BuyStockResponse, VendorApiError } from './types/stock-api';

/**
 * Cliente para interactuar con la API del proveedor de stocks
 */
export class VendorApiClient {
  constructor(private vendorApiRepository: VendorApiRepository) {}

  /**
   * Obtiene la lista de stocks disponibles
   * @param nextToken Token para paginación
   * @returns Lista de stocks
   */
  async listStocks(nextToken?: string): Promise<ListStocksResponse> {
    return this.vendorApiRepository.listStocks(nextToken);
  }

  /**
   * Ejecuta una compra de un stock
   * @param symbol Símbolo del stock
   * @param params Parámetros de la compra (precio y cantidad)
   * @returns Respuesta de la compra
   */
  async buyStock(symbol: string, params: BuyStockParams): Promise<BuyStockResponse> {
    return this.vendorApiRepository.buyStock(symbol, params);
  }

  // Puedes agregar aquí otros métodos que deleguen en vendorApiRepository
}
