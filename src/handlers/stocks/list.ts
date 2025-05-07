import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { apiKeySchema, listStocksQuerySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';
import { CacheService } from '../../services/cache-service';

// Cache configuration
const STOCK_CACHE_TABLE = process.env.STOCK_CACHE_TABLE || 'fuse-stock-cache-local';
const TOKEN_CACHE_TABLE = process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local';
const CACHE_TTL = 300; // 5 minutes

/**
 * Handler to list all available stocks
 */
const listStocksHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('List stocks handler started', { 
    queryParams: event.queryStringParameters,
    headers: {
      'x-api-key-exists': !!event.headers['x-api-key'],
      'X-API-Key-exists': !!event.headers['X-API-Key']
    }
  });

  // 1. Validate API key
  const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
  const apiKeyResult = apiKeySchema.safeParse(apiKey);
  
  if (!apiKeyResult.success) {
    throw handleZodError(apiKeyResult.error);
  }

  if (apiKey !== process.env.VENDOR_API_KEY) {
    throw new AuthenticationError('Invalid API key');
  }

  // 2. Validate and extract search parameters and pagination
  const queryParams = event.queryStringParameters || {};
  const queryResult = listStocksQuerySchema.safeParse(queryParams);
  
  if (!queryResult.success) {
    throw handleZodError(queryResult.error);
  }

  const { nextToken, search } = queryResult.data;
  console.log('Query parameters processed', { nextToken, search });

  // Create a cache key that includes pagination token for cache per page
  const baseKey = search ? `search:${search}` : 'all';
  // For first page, use base key; for other pages generate a deterministic key
  const cacheKey = nextToken ? `${baseKey}:page:${nextToken}` : baseKey;
  
  console.log('Cache settings', { 
    cacheKey, 
    STOCK_CACHE_TABLE,
    endpoint: process.env.DYNAMODB_ENDPOINT || 'default' 
  });

  // Initialize cache services
  const stockCacheService = new CacheService({
    tableName: STOCK_CACHE_TABLE,
    region: process.env.DYNAMODB_REGION || 'local',
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
  });

  const tokenCacheService = new CacheService({
    tableName: TOKEN_CACHE_TABLE,
    region: process.env.DYNAMODB_REGION || 'local',
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
  });

  // Try to get from cache
  let cacheHit = false;
  let cachedData: {
    items: any[];
    nextToken: string;
    totalItems: number;
    lastUpdated: string;
  } | null = null;

  try {
    console.log(`Attempting to retrieve from cache: ${cacheKey}`);
    const cacheRes = await stockCacheService.get<{
      items: any[];
      nextToken: string;
      totalItems: number;
      lastUpdated: string;
    }>(cacheKey);
    
    if (cacheRes && Array.isArray(cacheRes.items) && cacheRes.items.length > 0) {
      cachedData = cacheRes;
      cacheHit = true;
      console.log(`[CACHE HIT] Found data for key: ${cacheKey}`);
    } else {
      console.log(`[CACHE MISS] No data found for key: ${cacheKey}`);
    }
  } catch (err) {
    console.error(`[CACHE ERROR] Error retrieving data for key ${cacheKey}:`, err);
  }

  let items: any[] = [];
  let newNextToken: string | undefined;
  let totalItems = 0;
  let lastUpdated = new Date().toISOString();

  if (cacheHit && cachedData) {
    items = cachedData.items;
    newNextToken = cachedData.nextToken;
    totalItems = Number(cachedData.totalItems) || 0;
    lastUpdated = String(cachedData.lastUpdated || new Date().toISOString());
    console.log('Using cached data', { itemsCount: items.length, newNextToken });
  } else {
    // Initialize repositories and services
    const stockTokenRepo = new StockTokenRepository(tokenCacheService);
    const vendorApiRepository = new VendorApiRepository();
    const vendorApi = new VendorApiClient(vendorApiRepository);
    const stockService = new StockService(stockTokenRepo, vendorApi);
    
    console.log(`[API REQUEST] Calling vendor API with nextToken: ${nextToken}`);
    const result = await stockService.listAllStocks(nextToken, search);
    console.log('API response received', { 
      stocksCount: result.stocks.length, 
      resultNextToken: result.nextToken 
    });
    
    items = result.stocks.map(stock => ({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      currency: stock.currency || 'USD',
      lastUpdated: stock.lastUpdated,
      market: stock.market,
      percentageChange: stock.percentageChange,
      volume: stock.volume,
    }));
    newNextToken = result.nextToken;
    totalItems = result.totalItems || 0;
    lastUpdated = result.lastUpdated || new Date().toISOString();
    
    // Cache this page results
    try {
      console.log(`[CACHE] Saving data for key: ${cacheKey}`);
      await stockCacheService.set(cacheKey, {
        items,
        nextToken: newNextToken,
        totalItems,
        lastUpdated
      }, CACHE_TTL);
      console.log('Cache write successful');
    } catch (err) {
      console.error(`[CACHE ERROR] Error saving data for key ${cacheKey}:`, err);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'success',
      data: {
        items,
        nextToken: newNextToken,
        totalItems,
        lastUpdated
      },
      metadata: {
        cached: cacheHit
      }
    })
  };
};

export const handler = wrapHandler(listStocksHandler);
