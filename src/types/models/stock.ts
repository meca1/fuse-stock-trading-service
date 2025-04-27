export interface IStock {
  id: number;
  symbol: string;
  name: string;
  current_price: number;
  page_token?: string;
  page_number?: number;
  exchange?: string;
  last_updated?: Date;
  created_at?: Date;
  updated_at?: Date;
}

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

export interface EnhancedVendorStock {
  symbol: string;
  name: string;
  price: number;
  exchange?: string;
  timestamp?: string;
  percentageChange?: number;
  volume?: number;
  pageToken?: string;
} 