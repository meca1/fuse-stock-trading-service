import { User, Portfolio, Stock, Transaction } from '../models';
import { TransactionType, TransactionStatus } from '../models/interfaces';
import { initializeDatabase } from '../models';
import sequelize from '../config/database';

/**
 * Función para crear datos de prueba en la base de datos
 */
const seedDatabase = async () => {
  try {
    console.log('Iniciando la carga de datos de prueba...');

    // Crear usuarios
    const user1 = await User.create({
      name: 'Usuario Demo',
      email: 'demo@example.com',
      password: 'password123', // En producción, esto debería estar hasheado
      isActive: true,
    });

    console.log(`Usuario creado: ${user1.name} (${user1.id})`);

    // Crear portfolio para el usuario
    const portfolio1 = await Portfolio.create({
      name: 'Portfolio Principal',
      description: 'Portfolio de inversiones principales',
      balance: 10000.00,
      userId: user1.id,
    });

    console.log(`Portfolio creado: ${portfolio1.name} (${portfolio1.id})`);

    // Crear algunos stocks
    const stocks = [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currentPrice: 150.25,
        lastUpdated: new Date(),
        description: 'Empresa de tecnología y fabricante del iPhone',
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        currentPrice: 245.75,
        lastUpdated: new Date(),
        description: 'Empresa de software y servicios en la nube',
      },
      {
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        currentPrice: 2750.50,
        lastUpdated: new Date(),
        description: 'Empresa matriz de Google',
      },
    ];

    for (const stockData of stocks) {
      await Stock.create(stockData);
      console.log(`Stock creado: ${stockData.symbol} - ${stockData.name}`);
    }

    // Crear algunas transacciones
    const transactions = [
      {
        portfolioId: portfolio1.id,
        stockSymbol: 'AAPL',
        type: TransactionType.BUY,
        quantity: 10,
        price: 150.25,
        totalAmount: 1502.50,
        status: TransactionStatus.COMPLETED,
        transactionDate: new Date(),
      },
      {
        portfolioId: portfolio1.id,
        stockSymbol: 'MSFT',
        type: TransactionType.BUY,
        quantity: 5,
        price: 245.75,
        totalAmount: 1228.75,
        status: TransactionStatus.COMPLETED,
        transactionDate: new Date(),
      },
    ];

    for (const txData of transactions) {
      await Transaction.create(txData);
      console.log(`Transacción creada: ${txData.type} ${txData.quantity} ${txData.stockSymbol}`);
    }

    console.log('Datos de prueba cargados correctamente');
    return true;
  } catch (error) {
    console.error('Error al cargar los datos de prueba:', error);
    return false;
  }
};

// Ejecutar si este archivo se llama directamente
if (require.main === module) {
  // Inicializar la base de datos y cargar datos de prueba
  (async () => {
    try {
      // Forzar la sincronización (recrear tablas)
      const force = process.argv.includes('--force');
      
      if (force) {
        console.warn('⚠️ ADVERTENCIA: Se borrarán todas las tablas existentes y se recrearán.');
      }
      
      // Inicializar la base de datos
      const initialized = await initializeDatabase(force);
      
      if (!initialized) {
        console.error('No se pudo inicializar la base de datos.');
        process.exit(1);
      }
      
      // Cargar datos de prueba
      const seeded = await seedDatabase();
      
      if (seeded) {
        console.log('✅ Proceso completado con éxito.');
      } else {
        console.error('❌ Error al cargar los datos de prueba.');
        process.exit(1);
      }
      
      // Cerrar la conexión
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('Error en el proceso:', error);
      process.exit(1);
    }
  })();
}

export { seedDatabase };
