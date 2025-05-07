import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { listStocksQuerySchema } from '../../types/schemas/handlers';
import { CacheService } from '../../services/cache-service';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import { apiKeyValidator } from '../../middleware/api-key-validator';
import { queryParamsValidator } from '../../middleware/query-params-validator';

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

  // Initialize services
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

  const stockTokenRepo = new StockTokenRepository(tokenCacheService);
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  const stockService = new StockService(stockTokenRepo, vendorApi);

  // Get stocks data (with cache handling)
  const { nextToken, search } = event.queryStringParameters || {};
  const { data: responseData, cached } = await stockService.getStocksWithCache({
    nextToken,
    search,
    cacheService: stockCacheService,
    cacheTTL: CACHE_TTL
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'success',
      data: responseData,
      metadata: {
        cached
      }
    })
  };
};

// Export the handler wrapped with Middy middleware
export const handler = middy(listStocksHandler)
  .use(apiKeyValidator())
  .use(queryParamsValidator(listStocksQuerySchema))
  .use(httpErrorHandler());
