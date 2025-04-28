import { Handler } from 'aws-lambda';
import { DailyStockTokenService } from '../../services/daily-stock-token-service';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError } from '../../utils/errors/app-error';
import { updateStockTokensEventSchema } from '../../types/schemas/handlers';
import { DynamoDB } from 'aws-sdk';
import { StockTokenRepository } from '../../repositories/stock-token-repository';
import { VendorApiClient } from '../../services/vendor/api-client';

const updateStockTokensHandler: Handler = async (event, context) => {
  console.log('Starting daily stock token update lambda', { event });
  
  // Validate event structure
  updateStockTokensEventSchema.parse(event);
  
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