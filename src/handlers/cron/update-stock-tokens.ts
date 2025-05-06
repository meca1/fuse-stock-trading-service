import { Handler } from 'aws-lambda';
import { DailyStockTokenService } from '../../services/daily-stock-token-service';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError, AuthenticationError } from '../../utils/errors/app-error';
import { updateStockTokensEventSchema, apiKeySchema } from '../../types/schemas/handlers';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';
import { VendorApiRepository } from '../../repositories/vendor-api-repository';
import { handleZodError } from '../../middleware/zod-error-handler';

const updateStockTokensHandler: Handler = async (event, context) => {
  console.log('Starting daily stock token update lambda', { 
    event,
    headers: event.headers ? {
      'x-api-key-exists': !!event.headers['x-api-key'],
      'X-API-Key-exists': !!event.headers['X-API-Key']
    } : 'No headers'
  });
  
  // Validate event structure
  updateStockTokensEventSchema.parse(event);
  
  // Validate API key if this is an API Gateway event
  if (event.headers) {
    const apiKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
    const apiKeyResult = apiKeySchema.safeParse(apiKey);
    
    if (!apiKeyResult.success) {
      throw handleZodError(apiKeyResult.error);
    }

    if (apiKey !== process.env.VENDOR_API_KEY) {
      throw new AuthenticationError('Invalid API key');
    }
  }
  
  const dynamoDb = DynamoDBDocument.from(new DynamoDB({
    region: process.env.DYNAMODB_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
    },
    endpoint: process.env.DYNAMODB_ENDPOINT
  }));
  const stockTokenRepo = new StockTokenRepository(dynamoDb, process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-local');
  const vendorApiRepository = new VendorApiRepository();
  const vendorApi = new VendorApiClient(vendorApiRepository);
  const service = new DailyStockTokenService(stockTokenRepo, vendorApi);
  await service.updateStockTokens().catch((error: any) => {
    console.error('Error updating stock tokens:', error);
    throw new AppError('Failed to update stock tokens', 500, 'INTERNAL_ERROR');
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: 'success',
      message: 'Stock tokens updated successfully'
    })
  };
};

export const handler = wrapHandler(updateStockTokensHandler); 