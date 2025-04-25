import { User } from './User';
import { Portfolio } from './Portfolio';
import { Stock } from './Stock';
import { Transaction } from './Transaction';
import sequelize from '../config/database';

// Configure relationships between models
User.hasMany(Portfolio, { foreignKey: 'userId', as: 'portfolios' });
Portfolio.belongsTo(User, { foreignKey: 'userId' });

Portfolio.hasMany(Transaction, { foreignKey: 'portfolioId', as: 'transactions' });
Transaction.belongsTo(Portfolio, { foreignKey: 'portfolioId' });

Stock.hasMany(Transaction, { foreignKey: 'stockSymbol', as: 'transactions' });
Transaction.belongsTo(Stock, { foreignKey: 'stockSymbol' });

// Export all models
export {
  User,
  Portfolio,
  Stock,
  Transaction,
};

/**
 * Initialize the database
 * @param {boolean} forceSync - If true, will drop all tables and recreate them
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export const initializeDatabase = async (forceSync = false): Promise<boolean> => {
  try {
    // Add all models to Sequelize
    sequelize.addModels([User, Portfolio, Stock, Transaction]);
    
    // Synchronize the database
    // forceSync = true will drop all tables and recreate them
    await sequelize.sync({ force: forceSync });
    
    console.log('Database synchronized successfully');
    return true;
  } catch (error) {
    console.error('Error synchronizing database:', error);
    return false;
  }
};

export default {
  sequelize,
  User,
  Portfolio,
  Stock,
  Transaction,
  initializeDatabase,
};
