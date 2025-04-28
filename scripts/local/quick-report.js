// Script para ejecutar el reporte diario sin mantener el proceso
require('dotenv').config();

// Asegurar que estamos en modo local
process.env.NODE_ENV = 'development';
process.env.EMAIL_PROVIDER = 'smtp';

// Importamos los módulos necesarios
async function runReport() {
  try {
    console.log('Iniciando generación de reporte manual...');
    
    // Necesitamos importar el handler desde la versión compilada
    const { handler } = require('../../dist/handlers/cron/daily-report');
    
    // Usar la fecha actual
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
    
    // Terminar el proceso
    process.exit(0);
  } catch (error) {
    console.error('Error al ejecutar el reporte:', error);
    process.exit(1);
  }
}

// Ejecutar el reporte inmediatamente
runReport(); 