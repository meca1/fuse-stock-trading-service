import { initializeDatabase } from '../models';
import sequelize from '../config/database';

/**
 * Tests the database connection
 * @returns {Promise<boolean>} True if connection is successful, false otherwise
 */
const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
    return false;
  }
};

/**
 * Initializes the database by syncing models
 * @returns {Promise<void>}
 */
const initDb = async (): Promise<void> => {
  // Test database connection
  const connectionSuccessful = await testDatabaseConnection();
  
  if (!connectionSuccessful) {
    console.error('Could not initialize database due to connection issues.');
    process.exit(1);
  }
  
  // Initialize database (sync models)
  const forceSync = process.env.NODE_ENV === 'development' && process.argv.includes('--force');
  
  if (forceSync) {
    console.warn('⚠️ WARNING: All existing tables will be dropped and recreated.');
  }
  
  const initialized = await initializeDatabase(forceSync);
  
  if (initialized) {
    console.log(`✅ Database initialized successfully in ${forceSync ? 'force' : 'normal'} mode.`);
  } else {
    console.error('❌ Error initializing database.');
    process.exit(1);
  }
  
  // Close connection
  await sequelize.close();
};

// Execute if this file is called directly
if (require.main === module) {
  initDb()
    .then(() => {
      console.log('Process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error in initialization process:', error);
      process.exit(1);
    });
}

export { testDatabaseConnection, initDb };
