import { Portfolio } from '../models/Portfolio';
import { Transaction } from '../models/Transaction';
import { Stock } from '../models/Stock';
import { User } from '../models/User';
import { StockService } from './stock-service';
import { VendorApiClient } from './vendor/api-client';
import { BuyStockParams } from '../types/vendor';
import { TransactionStatus, TransactionType } from '../models/interfaces';
import sequelize from '../config/database';

/**
 * Service to handle portfolio-related operations
 */
export class PortfolioService {
  private stockService: StockService;
  private vendorApi: VendorApiClient;

  constructor() {
    this.stockService = new StockService();
    this.vendorApi = new VendorApiClient();
  }

  /**
   * Gets all portfolios for a user
   * @param userId User ID
   * @returns List of portfolios with their transactions
   */
  async getUserPortfolios(userId: string): Promise<Portfolio[]> {
    try {
      const portfolios = await Portfolio.findAll({
        where: { userId },
        include: [
          {
            model: Transaction,
            as: 'transactions',
            include: [{ model: Stock }],
          },
        ],
      });

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
  async getPortfolioById(portfolioId: string): Promise<Portfolio | null> {
    try {
      const portfolio = await Portfolio.findByPk(portfolioId, {
        include: [
          {
            model: Transaction,
            as: 'transactions',
            include: [{ model: Stock }],
          },
          { model: User },
        ],
      });

      return portfolio;
    } catch (error) {
      console.error(`Error getting portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  /**
   * Executes a stock purchase for a portfolio
   * @param portfolioId Portfolio ID
   * @param symbol Stock symbol
   * @param quantity Quantity to buy
   * @param price Offered price
   * @returns Created transaction
   */
  async buyStock(
    portfolioId: string,
    symbol: string,
    quantity: number,
    price: number
  ): Promise<Transaction> {
    // Start database transaction
    const dbTransaction = await sequelize.transaction();

    try {
      // Get the portfolio
      const portfolio = await Portfolio.findByPk(portfolioId, { transaction: dbTransaction });
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }

      // Get updated stock
      const stock = await this.stockService.getStockBySymbol(symbol);
      if (!stock) {
        throw new Error(`Stock not found: ${symbol}`);
      }

      // Verify that the offered price is valid
      if (!this.stockService.isValidPrice(stock.currentPrice, price)) {
        // Create failed transaction
        const failedTransaction = await Transaction.create(
          {
            portfolioId,
            stockSymbol: symbol,
            type: TransactionType.BUY,
            quantity,
            price,
            totalAmount: price * quantity,
            status: TransactionStatus.FAILED,
            errorMessage: 'Price outside acceptable range (±2%)',
            transactionDate: new Date(),
          },
          { transaction: dbTransaction }
        );

        await dbTransaction.commit();
        return failedTransaction;
      }

      // Calculate total amount
      const totalAmount = price * quantity;

      // Verify that the portfolio has sufficient balance
      if (portfolio.balance < totalAmount) {
        // Create failed transaction
        const failedTransaction = await Transaction.create(
          {
            portfolioId,
            stockSymbol: symbol,
            type: TransactionType.BUY,
            quantity,
            price,
            totalAmount,
            status: TransactionStatus.FAILED,
            errorMessage: 'Insufficient balance',
            transactionDate: new Date(),
          },
          { transaction: dbTransaction }
        );

        await dbTransaction.commit();
        return failedTransaction;
      }

      // Execute purchase with the vendor
      const buyParams: BuyStockParams = {
        price,
        quantity,
      };

      try {
        const buyResponse = await this.vendorApi.buyStock(symbol, buyParams);

        // Update portfolio balance
        portfolio.balance -= totalAmount;
        await portfolio.save({ transaction: dbTransaction });

        // Create successful transaction
        const transaction = await Transaction.create(
          {
            portfolioId,
            stockSymbol: symbol,
            type: TransactionType.BUY,
            quantity,
            price,
            totalAmount,
            status: TransactionStatus.COMPLETED,
            transactionDate: new Date(),
          },
          { transaction: dbTransaction }
        );

        await dbTransaction.commit();
        return transaction;
      } catch (error: any) {
        // Create failed transaction
        const failedTransaction = await Transaction.create(
          {
            portfolioId,
            stockSymbol: symbol,
            type: TransactionType.BUY,
            quantity,
            price,
            totalAmount,
            status: TransactionStatus.FAILED,
            errorMessage: `Error in vendor API: ${error.message || 'Unknown error'}`,
            transactionDate: new Date(),
          },
          { transaction: dbTransaction }
        );

        await dbTransaction.commit();
        return failedTransaction;
      }
    } catch (error) {
      // Rollback transaction in case of error
      await dbTransaction.rollback();
      console.error(`Error buying stock ${symbol} for portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  /**
   * Gets a summary of positions for a portfolio
   * @param portfolioId Portfolio ID
   * @returns Position summary
   */
  async getPortfolioSummary(portfolioId: string): Promise<any> {
    try {
      // Get all completed transactions for the portfolio
      const transactions = await Transaction.findAll({
        where: {
          portfolioId,
          status: TransactionStatus.COMPLETED,
        },
        include: [{ model: Stock }],
      });

      // Group by stock symbol
      const positionsBySymbol = new Map<string, { quantity: number; totalCost: number; stock: Stock }>();

      transactions.forEach((transaction) => {
        const { stockSymbol, quantity, totalAmount, type, stock } = transaction;

        if (!positionsBySymbol.has(stockSymbol)) {
          positionsBySymbol.set(stockSymbol, {
            quantity: 0,
            totalCost: 0,
            stock,
          });
        }

        const position = positionsBySymbol.get(stockSymbol)!;

        if (type === TransactionType.BUY) {
          position.quantity += quantity;
          position.totalCost += totalAmount;
        } else if (type === TransactionType.SELL) {
          position.quantity -= quantity;
          position.totalCost -= totalAmount;
        }
      });

      // Convert map to array of positions
      const positions = Array.from(positionsBySymbol.entries()).map(([symbol, position]) => {
        const { quantity, totalCost, stock } = position;
        const averageCost = quantity > 0 ? totalCost / quantity : 0;
        const currentValue = quantity * stock.currentPrice;
        const profitLoss = currentValue - totalCost;
        const profitLossPercentage = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

        return {
          symbol,
          name: stock.name,
          quantity,
          averageCost,
          currentPrice: stock.currentPrice,
          currentValue,
          totalCost,
          profitLoss,
          profitLossPercentage,
        };
      });

      // Calculate total portfolio value
      const totalValue = positions.reduce((sum, position) => sum + position.currentValue, 0);

      return {
        positions,
        totalValue,
      };
    } catch (error) {
      console.error(`Error getting portfolio summary for ${portfolioId}:`, error);
      throw error;
    }
  }
}
