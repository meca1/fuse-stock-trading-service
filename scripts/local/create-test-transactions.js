// Script para crear transacciones de prueba para la fecha actual
require('dotenv').config();

// Asegurar que estamos en modo local
process.env.NODE_ENV = 'development';

const { Client } = require('pg');

// Tipos de transacción y estados
const TransactionType = {
  BUY: 'BUY',
  SELL: 'SELL'
};

const TransactionStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

// Conectar a la base de datos
async function createTestTransactions() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stock_trading',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos PostgreSQL');

    // Fecha actual para las transacciones
    const today = new Date().toISOString();
    
    // Crear algunas transacciones de prueba
    const testTransactions = [
      // Transacciones exitosas
      {
        portfolio_id: 1,
        stock_symbol: 'AAPL',
        type: TransactionType.BUY,
        quantity: 10,
        price: 150.75,
        status: TransactionStatus.COMPLETED,
        date: today,
        notes: 'Compra exitosa de Apple'
      },
      {
        portfolio_id: 1,
        stock_symbol: 'GOOGL',
        type: TransactionType.BUY,
        quantity: 5,
        price: 2500.50,
        status: TransactionStatus.COMPLETED,
        date: today,
        notes: 'Compra exitosa de Google'
      },
      {
        portfolio_id: 2,
        stock_symbol: 'MSFT',
        type: TransactionType.SELL,
        quantity: 8,
        price: 280.30,
        status: TransactionStatus.COMPLETED,
        date: today,
        notes: 'Venta exitosa de Microsoft'
      },
      // Transacciones fallidas
      {
        portfolio_id: 2,
        stock_symbol: 'AMZN',
        type: TransactionType.BUY,
        quantity: 3,
        price: 3200.10,
        status: TransactionStatus.FAILED,
        date: today,
        notes: 'Fondos insuficientes para la compra'
      },
      {
        portfolio_id: 3,
        stock_symbol: 'TSLA',
        type: TransactionType.SELL,
        quantity: 12,
        price: 800.25,
        status: TransactionStatus.FAILED,
        date: today,
        notes: 'Cantidad insuficiente en la cartera'
      }
    ];

    // Verificar si la columna notes existe
    const columnCheckQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'transactions' AND column_name = 'notes'
    `;
    
    const columnCheck = await client.query(columnCheckQuery);
    const notesColumnExists = columnCheck.rows.length > 0;
    
    console.log(`La columna notes ${notesColumnExists ? 'existe' : 'NO existe'} en la tabla transactions`);

    // Insertar transacciones
    for (const tx of testTransactions) {
      let query;
      let values;
      
      if (notesColumnExists) {
        query = `
          INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date, notes) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
          RETURNING id
        `;
        
        values = [
          tx.portfolio_id,
          tx.stock_symbol,
          tx.type,
          tx.quantity,
          tx.price,
          tx.status,
          tx.date,
          tx.notes
        ];
      } else {
        query = `
          INSERT INTO transactions (portfolio_id, stock_symbol, type, quantity, price, status, date) 
          VALUES ($1, $2, $3, $4, $5, $6, $7) 
          RETURNING id
        `;
        
        values = [
          tx.portfolio_id,
          tx.stock_symbol,
          tx.type,
          tx.quantity,
          tx.price,
          tx.status,
          tx.date
        ];
        
        console.log(`Nota (no almacenada en BD): ${tx.notes}`);
      }
      
      const result = await client.query(query, values);
      console.log(`Transacción insertada con ID: ${result.rows[0].id}, símbolo: ${tx.stock_symbol}, estado: ${tx.status}`);
    }
    
    console.log('¡Transacciones de prueba creadas con éxito!');
  } catch (error) {
    console.error('Error al crear transacciones de prueba:', error);
  } finally {
    await client.end();
    console.log('Conexión a la base de datos cerrada');
  }
}

// Ejecutar el script
createTestTransactions(); 