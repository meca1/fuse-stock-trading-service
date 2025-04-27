import { PortfolioRepository } from '../repositories/portfolio-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { IPortfolio } from '../types/models/portfolio';
import { ITransaction } from '../types/models/transaction';
import { TransactionType, TransactionStatus } from '../types/common/enums';
import { StockService } from './stock-service';
import { VendorApiClient } from './vendor/api-client';
import { UserRepository } from '../repositories/user-repository';
import { DatabaseService } from '../config/database';

/**
 * Service to handle portfolio-related operations
 */
export class PortfolioService {
  private static instance: PortfolioService | null = null;
  private portfolioRepository!: PortfolioRepository;
  private transactionRepository!: TransactionRepository;
  private stockService!: StockService;
  private vendorApi!: VendorApiClient;
  private userRepository!: UserRepository;
  private dbService!: DatabaseService;

  private constructor() {}

  private async initializeServices() {
    this.dbService = await DatabaseService.getInstance();
    this.portfolioRepository = new PortfolioRepository(this.dbService);
    this.transactionRepository = new TransactionRepository(this.dbService);
    this.stockService = StockService.getInstance();
    this.vendorApi = VendorApiClient.getInstance();
    this.userRepository = new UserRepository(this.dbService);
  }

  public static async getInstance(): Promise<PortfolioService> {
    if (!PortfolioService.instance) {
      PortfolioService.instance = new PortfolioService();
      await PortfolioService.instance.initializeServices();
    }
    return PortfolioService.instance;
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
      const portfolios = await this.portfolioRepository.findByUserId(userId);
      if (!portfolios || portfolios.length === 0) {
        return {
          status: "success",
          data: {
            userId,
            totalValue: 0,
            currency: "USD",
            lastUpdated: new Date().toISOString(),
            stocks: [],
            performance: {
              lastMonth: 0,
              lastYear: 0
            }
          }
        };
      }

      // Por ahora solo manejamos el primer portfolio del usuario
      const portfolio = portfolios[0];
      const summary = await this.portfolioRepository.getPortfolioValueAndSummary(portfolio.id);

      return {
        status: "success",
        data: summary
      };
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      throw error;
    }
  }
}
