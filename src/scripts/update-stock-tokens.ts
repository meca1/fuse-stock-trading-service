import { DailyStockTokenService } from '../services/daily-stock-token-service';

async function main() {
  try {
    const service = DailyStockTokenService.getInstance();
    await service.updateStockTokens();
    console.log('Daily stock token update completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error in daily stock token update:', error);
    process.exit(1);
  }
}

main(); 