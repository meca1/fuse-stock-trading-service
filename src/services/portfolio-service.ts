import { PortfolioRepository } from '../repositories/portfolio-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { IPortfolio, PortfolioStock, PortfolioSummaryResponse } from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { TransactionType, TransactionStatus } from '../types/common/enums';
import { StockService } from './stock-service';
import { UserRepository } from '../repositories/user-repository';
import { PortfolioCacheService } from './portfolio-cache-service';
import { DynamoDB } from 'aws-sdk';

/**
 * Service to handle portfolio-related operations
 */
export class PortfolioService {
  private cacheService: PortfolioCacheService;

  constructor(
    private portfolioRepository: PortfolioRepository,
    private transactionRepository: TransactionRepository,
    private userRepository: UserRepository,
    private stockService: StockService,
    cacheService?: PortfolioCacheService
  ) {
    // If no cache service is provided, create one
    if (!cacheService) {
      const dynamoDb = new DynamoDB.DocumentClient({
        region: process.env.DYNAMODB_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
          secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
        },
        endpoint: process.env.DYNAMODB_ENDPOINT
      });
      this.cacheService = new PortfolioCacheService(dynamoDb);
    } else {
      this.cacheService = cacheService;
    }
  }

  /**
   * Gets all portfolios for a user
   */
  async getUserPortfolios(userId: string): Promise<IPortfolio[]> {
    try {
      const portfolios = await this.portfolioRepository.findByUserId(userId);
      return portfolios;
    } catch (error) {
      console.error(`Error getting portfolios for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Creates a new portfolio for a user
   */
  async createPortfolio(userId: string, name: string): Promise<IPortfolio> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const portfolio = await this.portfolioRepository.create({
        name,
        user_id: userId
      });

      return portfolio;
    } catch (error) {
      console.error(`Error creating portfolio for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Executes a stock purchase
   */
  async executeStockPurchase(
    portfolioId: number,
    symbol: string,
    quantity: number,
    price: number,
    type: TransactionType
  ): Promise<ITransaction> {
    try {
      const stock = await this.stockService.getStockBySymbol(symbol);
      if (!stock) {
        throw new Error(`Stock with symbol ${symbol} not found`);
      }

      const priceDiff = Math.abs(price - stock.price);
      const maxDiff = stock.price * 0.02;
      if (priceDiff > maxDiff) {
        throw new Error(`Price must be within 2% of current price ($${stock.price})`);
      }

      const transaction = await this.transactionRepository.create({
        portfolio_id: portfolioId,
        stock_symbol: symbol,
        quantity,
        price,
        type,
        status: TransactionStatus.COMPLETED
      });

      // Get the portfolio to find the userId
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      if (portfolio) {
        // Invalidate all caches related to this user after a transaction
        await this.cacheService.invalidateAllUserRelatedCaches(
          portfolio.user_id, 
          [portfolioId]
        );
        console.log(`Cache invalidated for user ${portfolio.user_id} after transaction`);
      }

      return transaction;
    } catch (error) {
      console.error('Error executing stock purchase:', error);
      throw error;
    }
  }

  /**
   * Gets a summary of all portfolios for a user
   */
  async getUserPortfolioSummary(userId: string): Promise<any> {
    try {
      // Check cache first
      const cachedData = await this.cacheService.getCachedUserPortfolioSummary(userId);
      if (cachedData) {
        console.log(`Using cached portfolio summary for user: ${userId}`);
        
        // Add a flag to indicate this data came from cache
        if (typeof cachedData === 'object') {
          return {
            ...cachedData,
            isCached: true,
            cacheTimestamp: new Date().toISOString()
          };
        }
        
        return cachedData;
      }

      const portfolios = await this.portfolioRepository.findByUserId(userId);
      if (!portfolios || portfolios.length === 0) {
        const emptyResponse = {
          status: "success",
          data: {
            userId,
            totalValue: 0,
            currency: "USD",
            lastUpdated: new Date().toISOString(),
            stocks: []
          },
          isCached: false
        };
        
        // Cache empty response
        await this.cacheService.cacheUserPortfolioSummary(userId, emptyResponse);
        return emptyResponse;
      }

      // Por ahora solo manejamos el primer portfolio del usuario
      const portfolio = portfolios[0];
      const summary = await this.getPortfolioSummary(portfolio.id);

      const response = {
        status: "success",
        data: summary,
        isCached: false
      };
      
      // Cache the response
      await this.cacheService.cacheUserPortfolioSummary(userId, response);
      return response;
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene un resumen completo del portfolio incluyendo el valor actual de las acciones
   */
  async getPortfolioSummary(portfolioId: number): Promise<PortfolioSummaryResponse> {
    try {
      // Check cache first
      const cachedData = await this.cacheService.getCachedPortfolioSummary(portfolioId);
      if (cachedData) {
        console.log(`Using cached portfolio summary for portfolio: ${portfolioId}`);
        return {
          ...cachedData,
          fromCache: true
        };
      }

      // Obtenemos el portfolio
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }

      // Obtenemos el resumen de las acciones
      const stockSummary = await this.portfolioRepository.getPortfolioStockSummary(portfolioId);

      // Obtenemos los precios actuales de las acciones en paralelo
      const stockPromises = stockSummary.map(async (summary) => {
        try {
          const stockDetails = await this.stockService.getStockBySymbol(summary.symbol);
          if (!stockDetails) {
            console.warn(`Stock details not found for symbol: ${summary.symbol}`);
            return null;
          }

          const averagePrice = summary.total_cost / summary.quantity;
          const currentPrice = stockDetails.price;
          const profitLossAbsolute = (currentPrice - averagePrice) * summary.quantity;
          const profitLossPercentage = ((currentPrice - averagePrice) / averagePrice) * 100;

          return {
            symbol: summary.symbol,
            name: stockDetails.name || summary.symbol,
            quantity: summary.quantity,
            averagePrice: Number(averagePrice.toFixed(2)),
            currentPrice: Number(currentPrice.toFixed(2)),
            profitLoss: {
              absolute: Number(profitLossAbsolute.toFixed(2)),
              percentage: Number(profitLossPercentage.toFixed(1))
            }
          };
        } catch (error) {
          console.error(`Error getting stock details for ${summary.symbol}:`, error);
          return null;
        }
      });

      // Esperamos a que todas las promesas se resuelvan y filtramos los nulls
      const stocks = (await Promise.all(stockPromises)).filter((stock): stock is PortfolioStock => stock !== null);

      // Calculamos el valor total del portfolio
      const totalValue = stocks.reduce((sum, stock) => sum + (stock.currentPrice * stock.quantity), 0);

      // Actualizamos el valor total en la base de datos
      await this.portfolioRepository.updateValueAndTimestamp(portfolioId, totalValue);

      const response = {
        userId: portfolio.user_id,
        totalValue: Number(totalValue.toFixed(2)),
        currency: "USD",
        lastUpdated: new Date().toISOString(),
        stocks,
        fromCache: false
      };

      // Cache the response
      await this.cacheService.cachePortfolioSummary(portfolioId, response);
      return response;
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }

  /**
   * Obtiene el valor actual del portfolio
   */
  async getPortfolioValue(portfolioId: number): Promise<number> {
    const summary = await this.getPortfolioSummary(portfolioId);
    return summary.totalValue;
  }
}
