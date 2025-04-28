import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { DynamoDB } from 'aws-sdk';
import AWS from 'aws-sdk';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { apiKeySchema, listStocksQuerySchema } from '../../types/schemas/handlers';
import { handleZodError } from '../../middleware/zod-error-handler';

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT || 'http://localhost:8000',
});
const STOCK_CACHE_TABLE = process.env.STOCK_CACHE_TABLE || 'fuse-stock-cache-local';
const CACHE_TTL = 120; // segundos

/**
 * Handler to list all available stocks
 */
const listStocksHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // 1. Validar x-api-key
  const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
  const apiKeyResult = apiKeySchema.safeParse(apiKey);
  
  if (!apiKeyResult.success) {
    throw handleZodError(apiKeyResult.error);
  }

  if (apiKey !== process.env.VENDOR_API_KEY) {
    throw new AuthenticationError('Invalid API key');
  }

  // 2. Validar y extraer parámetros de búsqueda y paginación
  const queryParams = event.queryStringParameters || {};
  const queryResult = listStocksQuerySchema.safeParse(queryParams);
  
  if (!queryResult.success) {
    throw handleZodError(queryResult.error);
  }

  const { nextToken, search } = queryResult.data;

  // 3. Intentar obtener de caché DynamoDB
  let cacheKey = 'all';
  if (search) cacheKey = `search:${search}`;
  if (nextToken) cacheKey += `:next:${nextToken}`;
  let cacheHit = false;
  let cachedData;
  try {
    const cacheRes = await dynamo.get({
      TableName: STOCK_CACHE_TABLE,
      Key: { key: cacheKey },
    }).promise();
    if (cacheRes.Item && cacheRes.Item.data && cacheRes.Item.ttl > Math.floor(Date.now() / 1000)) {
      cachedData = cacheRes.Item.data;
      cacheHit = true;
      console.log(`[CACHE HIT] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`);
    }
  } catch (err) {
    console.error(`[CACHE ERROR] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`, err);
  }

  let items, newNextToken, totalItems, lastUpdated;
  if (cacheHit) {
    ({ items, nextToken: newNextToken, totalItems, lastUpdated } = cachedData);
  } else {
    // 4. Consultar al proveedor externo
    const dynamoDb = new DynamoDB.DocumentClient({
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
      },
      endpoint: process.env.DYNAMODB_ENDPOINT
    });
    const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
    const vendorApi = new VendorApiClient();
    const stockService = new StockService(stockTokenRepo, vendorApi);
    const result = await stockService.listAllStocks(nextToken, search);
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
    // Guardar en caché
    console.log(`[CACHE PUT] Tabla: ${STOCK_CACHE_TABLE}, Clave: ${cacheKey}`);
    await dynamo.put({
      TableName: STOCK_CACHE_TABLE,
      Item: {
        key: cacheKey,
        data: { items, nextToken: newNextToken, totalItems, lastUpdated },
        ttl: Math.floor(Date.now() / 1000) + CACHE_TTL,
      },
    }).promise();
  }

  // 5. Construir respuesta
  return {
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
        },
      },
    }),
  };
};

export const handler = wrapHandler(listStocksHandler);
