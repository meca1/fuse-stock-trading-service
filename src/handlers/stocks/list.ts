import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { StockService } from '../../services/stock-service';
import AWS from 'aws-sdk';

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT || 'http://localhost:8000',
});
const STOCK_CACHE_TABLE = process.env.STOCK_CACHE_TABLE || 'StockCache';
const CACHE_TTL = 120; // segundos

/**
 * Handler to list all available stocks
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Validar x-api-key
    const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
    if (!apiKey || apiKey !== process.env.VENDOR_API_KEY) {
      return {
        statusCode: 401,
        body: JSON.stringify({ status: 'error', message: 'Missing or invalid API key' }),
      };
    }

    // 2. Parámetros de búsqueda y paginación
    const nextToken = event.queryStringParameters?.nextToken;
    const search = event.queryStringParameters?.search;

    // 3. Intentar obtener de caché DynamoDB
    let cacheKey = 'all';
    if (search) cacheKey = `search:${search}`;
    if (nextToken) cacheKey += `:next:${nextToken}`;
    let cacheHit = false;
    let cachedData;
    try {
      const cacheRes = await dynamo.get({
        TableName: STOCK_CACHE_TABLE,
        Key: { symbol: cacheKey },
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
      const stockService = StockService.getInstance();
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
          symbol: cacheKey,
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
  } catch (error: any) {
    if (error.message && error.message.includes('timeout')) {
      return { statusCode: 504, body: JSON.stringify({ status: 'error', message: 'Timeout from provider' }) };
    }
    if (error.message && error.message.includes('provider')) {
      return { statusCode: 503, body: JSON.stringify({ status: 'error', message: 'Provider unavailable' }) };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ status: 'error', message: 'Internal server error', error: error.message }),
    };
  }
};
