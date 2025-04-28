import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { DynamoDB } from 'aws-sdk';
import AWS from 'aws-sdk';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { apiKeySchema, listStocksQuerySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';

// Use consistent DynamoDB configuration
const dynamoConfig = {
  region: process.env.DYNAMODB_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
  },
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
};

const dynamo = new AWS.DynamoDB.DocumentClient(dynamoConfig);
const STOCK_CACHE_TABLE = process.env.STOCK_CACHE_TABLE || 'fuse-stock-cache-local';
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
  const cacheKey = nextToken ? `${baseKey}:page:${Buffer.from(nextToken).toString('base64')}` : baseKey;
  
  console.log('Cache settings', { 
    cacheKey, 
    STOCK_CACHE_TABLE,
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT || 'default' 
  });

  // Try to get from cache
  let cacheHit = false;
  let cachedData;
  try {
    console.log(`Attempting to retrieve from cache: ${cacheKey}`);
    const cacheRes = await dynamo.get({
      TableName: STOCK_CACHE_TABLE,
      Key: { key: cacheKey },
    }).promise();
    
    console.log('Cache response', { 
      itemExists: !!cacheRes.Item,
      dataExists: cacheRes.Item && !!cacheRes.Item.data,
      ttl: cacheRes.Item && cacheRes.Item.ttl,
      currentTime: Math.floor(Date.now() / 1000)
    });
    
    if (cacheRes.Item && cacheRes.Item.data && cacheRes.Item.ttl > Math.floor(Date.now() / 1000)) {
      cachedData = cacheRes.Item.data;
      cacheHit = true;
      console.log(`[CACHE HIT] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`);
    } else {
      console.log(`[CACHE MISS] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}, Reason: ${!cacheRes.Item ? 'Item not found' : !cacheRes.Item.data ? 'Data not found' : 'TTL expired'}`);
    }
  } catch (err) {
    console.error(`[CACHE ERROR] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`, err);
  }

  let items, newNextToken, totalItems, lastUpdated;
  if (cacheHit) {
    ({ items, nextToken: newNextToken, totalItems, lastUpdated } = cachedData);
    console.log('Using cached data', { itemsCount: items.length, newNextToken });
  } else {
    // 4. Call the API provider
    const dynamoDb = new DynamoDB.DocumentClient(dynamoConfig);
    const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
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
    totalItems = result.totalItems;
    lastUpdated = result.lastUpdated;
    
    // Cache this page results
    try {
      console.log(`[CACHE PUT] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`);
      const cacheItem = {
        key: cacheKey,
        data: { items, nextToken: newNextToken, totalItems, lastUpdated },
        ttl: Math.floor(Date.now() / 1000) + CACHE_TTL,
      };
      console.log('Caching data with details', { 
        tableExists: !!STOCK_CACHE_TABLE,
        ttlValue: cacheItem.ttl, 
        itemsCount: items.length,
        hasNextToken: !!newNextToken
      });
      
      await dynamo.put({
        TableName: STOCK_CACHE_TABLE,
        Item: cacheItem,
      }).promise();
      console.log('Cache write successful');
      
      // If we have a next token, also cache a placeholder for the next page
      // This helps ensure the nextToken is preserved exactly as returned by the API
      if (newNextToken) {
        const nextPageKey = `${baseKey}:page:${Buffer.from(newNextToken).toString('base64')}`;
        console.log(`Pre-caching next page key: ${nextPageKey}`);
        await dynamo.put({
          TableName: STOCK_CACHE_TABLE,
          Item: {
            key: nextPageKey,
            nextToken: newNextToken,
            ttl: Math.floor(Date.now() / 1000) + 60, // Short TTL for placeholders
          },
        }).promise();
      }
    } catch (err) {
      console.error(`[CACHE WRITE ERROR] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`, err);
    }
  }

  // 5. Construct response
  const response = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      data: {
        items,
        nextToken: newNextToken,
        metadata: {
          totalItems: totalItems || items.length,
          cache: cacheHit,
          cacheKey: cacheKey // Include for debugging
        },
      },
    })
  };
  
  console.log('Sending response', { 
    statusCode: 200, 
    itemsCount: items.length, 
    nextToken: newNextToken, 
    fromCache: cacheHit 
  });
  
  return response;
};

export const handler = wrapHandler(listStocksHandler);
