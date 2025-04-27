import { Handler } from 'aws-lambda';
import { DailyStockTokenService } from '../../services/daily-stock-token-service';
import { wrapHandler } from '../../middleware/lambda-error-handler';
import { AppError } from '../../utils/errors/app-error';

const updateStockTokensHandler: Handler = async (event, context) => {
  console.log('Starting daily stock token update lambda', { event });
  
  const service = DailyStockTokenService.getInstance();
  await service.updateStockTokens().catch(error => {
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