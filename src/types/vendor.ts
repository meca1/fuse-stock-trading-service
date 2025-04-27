export interface VendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange?: string;
  timestamp?: string;
}

export interface ListStocksResponse {
  data: {
    items: VendorStock[];
    nextToken?: string;
  };
} 