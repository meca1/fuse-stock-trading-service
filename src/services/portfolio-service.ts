import { StockService } from './stock-service';
import { VendorApiClient } from './vendor/api-client';
import { BuyStockParams } from '../types/vendor';
import { TransactionStatus, TransactionType } from '../models/interfaces';
import { IPortfolio, ITransaction, IStock, IUser } from '../models/interfaces';
import { PortfolioRepository } from '../repositories/portfolio-repository';
import { StockRepository } from '../repositories/stock-repository';
import { TransactionRepository } from '../repositories/transaction-repository';
import { UserRepository } from '../repositories/user-repository';
import pool from '../config/database';

/**
 * Service to handle portfolio-related operations
 */
export class PortfolioService {
  private stockService: StockService;
  private vendorApi: VendorApiClient;
  private portfolioRepository: PortfolioRepository;
  private stockRepository: StockRepository;
  private transactionRepository: TransactionRepository;
  private userRepository: UserRepository;

  constructor() {
    this.stockService = new StockService();
    this.vendorApi = new VendorApiClient();
    this.portfolioRepository = new PortfolioRepository();
    this.stockRepository = new StockRepository();
    this.transactionRepository = new TransactionRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Gets all portfolios for a user
   * @param userId User ID
   * @returns List of portfolios with their transactions
   */
  async getUserPortfolios(userId: number): Promise<IPortfolio[]> {
    try {
      const portfolios = await this.portfolioRepository.findByUserId(userId);
      return portfolios;
    } catch (error) {
      console.error(`Error getting portfolios for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Gets a specific portfolio by ID
   * @param portfolioId Portfolio ID
   * @returns Portfolio or null if it doesn't exist
   */
  async getPortfolio(portfolioId: number): Promise<IPortfolio | null> {
    try {
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      return portfolio;
    } catch (error) {
      console.error(`Error getting portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  /**
   * Creates a new portfolio for a user
   * @param userId User ID
   * @param name Portfolio name
   * @returns Created portfolio
   */
  async createPortfolio(userId: number, name: string): Promise<IPortfolio> {
    try {
      // Verify that the user exists
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Create the portfolio
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
   * Buys a stock for a portfolio
   * @param params Buy stock parameters
   * @returns Transaction
   */
  async buyStock(params: BuyStockParams): Promise<ITransaction> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify that the portfolio exists and belongs to the user
      const portfolio = await this.portfolioRepository.findById(params.portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio with ID ${params.portfolioId} not found`);
      }

      // Verify that the stock exists
      const stock = await this.stockRepository.findBySymbol(params.symbol);
      if (!stock) {
        throw new Error(`Stock with symbol ${params.symbol} not found`);
      }

      // Verify that the price is valid (within 2% of the current price)
      if (!this.stockService.isValidPrice(stock.current_price, params.price)) {
        throw new Error(`Invalid price: ${params.price}. Current price is ${stock.current_price}`);
      }

      // Create the transaction
      const transaction = await this.transactionRepository.create({
        portfolio_id: params.portfolioId,
        stock_id: stock.id,
        type: TransactionType.BUY,
        quantity: params.quantity,
        price: params.price,
        status: TransactionStatus.COMPLETED,
        date: new Date()
      });

      await client.query('COMMIT');
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error buying stock:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sells a stock from a portfolio
   * @param portfolioId Portfolio ID
   * @param stockId Stock ID
   * @param quantity Quantity to sell
   * @param price Price per share
   * @returns Transaction
   */
  async sellStock(
    portfolioId: number,
    stockId: number,
    quantity: number,
    price: number
  ): Promise<ITransaction> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify that the portfolio exists
      const portfolio = await this.portfolioRepository.findById(portfolioId);
      if (!portfolio) {
        throw new Error(`Portfolio with ID ${portfolioId} not found`);
      }

      // Verify that the stock exists
      const stock = await this.stockRepository.findById(stockId);
      if (!stock) {
        throw new Error(`Stock with ID ${stockId} not found`);
      }

      // Verify that the price is valid (within 2% of the current price)
      if (!this.stockService.isValidPrice(stock.current_price, price)) {
        throw new Error(`Invalid price: ${price}. Current price is ${stock.current_price}`);
      }

      // Verify that the user has enough shares to sell
      const ownedQuantity = await this.transactionRepository.getStockQuantityInPortfolio(portfolioId, stockId);
      if (ownedQuantity < quantity) {
        throw new Error(`Not enough shares to sell. Owned: ${ownedQuantity}, Requested: ${quantity}`);
      }

      // Create the transaction
      const transaction = await this.transactionRepository.create({
        portfolio_id: portfolioId,
        stock_id: stockId,
        type: TransactionType.SELL,
        quantity,
        price,
        status: TransactionStatus.COMPLETED,
        date: new Date()
      });

      await client.query('COMMIT');
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error selling stock:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gets a summary of a portfolio with current values
   * @param portfolioId Portfolio ID
   * @returns Portfolio summary
   */
  async getPortfolioSummary(portfolioId: number): Promise<any> {
    try {
      const summary = await this.portfolioRepository.getPortfolioSummary(portfolioId);
      
      if (!summary) {
        throw new Error(`Portfolio with ID ${portfolioId} not found`);
      }
      
      return summary;
    } catch (error) {
      console.error(`Error getting portfolio summary for ${portfolioId}:`, error);
      throw error;
    }
  }

  /**
   * Gets all transactions for a portfolio
   * @param portfolioId Portfolio ID
   * @returns List of transactions
   */
  async getPortfolioTransactions(portfolioId: number): Promise<ITransaction[]> {
    try {
      const transactions = await this.transactionRepository.findByPortfolioId(portfolioId);
      return transactions;
    } catch (error) {
      console.error(`Error getting transactions for portfolio ${portfolioId}:`, error);
      throw error;
    }
  }
}
