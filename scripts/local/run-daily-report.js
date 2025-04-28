// Script para ejecutar el reporte diario usando node-cron
require('dotenv').config();

// Asegurar que estamos en modo local
process.env.NODE_ENV = 'development';
process.env.EMAIL_PROVIDER = 'smtp';

const cron = require('node-cron');
const path = require('path');

// Importamos los módulos necesarios
async function runReport() {
  try {
    console.log('Iniciando generación de reporte manual...');
    
    // Necesitamos importar el handler desde la versión compilada
    const { handler } = require('../../dist/handlers/cron/daily-report');
    
    // Usar la fecha actual en lugar de ayer
    const today = new Date().toISOString().split('T')[0];
    console.log(`Generando reporte para HOY: ${today}`);
    
    // Pasar un evento con la fecha como parámetro
    const result = await handler({
      queryStringParameters: {
        date: today
      }
    }, { 
      getRemainingTimeInMillis: () => 30000 
    });
    
    console.log('Resultado:', JSON.stringify(result, null, 2));
    console.log('Reporte generado correctamente');
  } catch (error) {
    console.error('Error al ejecutar el reporte:', error);
  }
}

// Si se ejecuta directamente, correr el reporte inmediatamente
if (require.main === module) {
  console.log('Ejecutando reporte inmediatamente...');
  runReport();
}

// Configurar cron para ejecutar a las 23:59 todos los días
cron.schedule('59 23 * * *', () => {
  console.log(`Ejecutando reporte programado a las ${new Date().toISOString()}`);
  runReport();
});

console.log('Servicio de reportes iniciado. El reporte se ejecutará a las 23:59 todos los días.');
console.log('Presiona Ctrl+C para detener el servicio.');

// Mantener el proceso vivo
process.stdin.resume(); 