import { Handler } from 'aws-lambda';
import { DailyStockTokenService } from '../../services/daily-stock-token-service';

export const handler: Handler = async (event, context) => {
  console.log('Starting daily stock token update lambda', { event });
  
  try {
    const service = DailyStockTokenService.getInstance();
    await service.updateStockTokens();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Stock tokens updated successfully'
      })
    };
  } catch (error) {
    console.error('Error updating stock tokens:', error);
    throw error;
  }
}; 