// Script para verificar transacciones de hoy
require('dotenv').config();

const { Client } = require('pg');

async function checkTransactions() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'stock_trading',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos');
    
    // Obtener fecha actual
    const today = new Date().toISOString().split('T')[0];
    console.log('Fecha de hoy:', today);
    
    // Consultar transacciones de hoy
    const startDate = new Date(`${today}T00:00:00Z`);
    const endDate = new Date(`${today}T23:59:59Z`);
    
    console.log(`Buscando transacciones entre ${startDate.toISOString()} y ${endDate.toISOString()}`);
    
    const result = await client.query(`
      SELECT * FROM transactions 
      WHERE date BETWEEN $1 AND $2
    `, [startDate.toISOString(), endDate.toISOString()]);
    
    console.log(`Se encontraron ${result.rows.length} transacciones`);
    
    if (result.rows.length > 0) {
      console.log('Primeras 5 transacciones:');
      result.rows.slice(0, 5).forEach(tx => {
        console.log(`ID: ${tx.id}, Símbolo: ${tx.stock_symbol}, Estado: ${tx.status}, Fecha: ${tx.date}`);
      });
    }
    
    // Mostrar todas las transacciones sin filtro de fecha
    console.log("\nConsultando TODAS las transacciones sin filtro de fecha:");
    const allResult = await client.query("SELECT * FROM transactions ORDER BY date DESC LIMIT 10");
    console.log(`Se encontraron ${allResult.rows.length} transacciones en total (limitado a 10)`);
    
    if (allResult.rows.length > 0) {
      console.log('Últimas transacciones:');
      allResult.rows.forEach(tx => {
        console.log(`ID: ${tx.id}, Símbolo: ${tx.stock_symbol}, Estado: ${tx.status}, Fecha: ${new Date(tx.date).toISOString()}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkTransactions(); 