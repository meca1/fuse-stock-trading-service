// Script para inicializar DynamoDB local
const AWS = require('aws-sdk');

// Configuración para DynamoDB local
const dynamoConfig = {
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  accessKeyId: 'LOCAL_FAKE_KEY',
  secretAccessKey: 'LOCAL_FAKE_SECRET'
};

// Nombre de la tabla de caché
const STOCK_CACHE_TABLE = 'StockCache';

// Crear instancia de DynamoDB
const dynamoDB = new AWS.DynamoDB(dynamoConfig);

// Función para inicializar la tabla de caché
async function initializeStockCacheTable() {
  try {
    // Verificar si la tabla ya existe
    const tables = await dynamoDB.listTables().promise();
    if (tables.TableNames && tables.TableNames.includes(STOCK_CACHE_TABLE)) {
      console.log(`Tabla ${STOCK_CACHE_TABLE} ya existe`);
      return;
    }

    // Crear tabla
    const params = {
      TableName: STOCK_CACHE_TABLE,
      KeySchema: [
        { AttributeName: 'symbol', KeyType: 'HASH' } // Clave de partición
      ],
      AttributeDefinitions: [
        { AttributeName: 'symbol', AttributeType: 'S' }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };

    await dynamoDB.createTable(params).promise();
    console.log(`Tabla ${STOCK_CACHE_TABLE} creada exitosamente`);
    
    // Habilitar TTL en la tabla
    await dynamoDB.updateTimeToLive({
      TableName: STOCK_CACHE_TABLE,
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true
      }
    }).promise();
    
    console.log(`TTL habilitado en la tabla ${STOCK_CACHE_TABLE}`);
  } catch (error) {
    console.error('Error al inicializar la tabla de caché:', error);
    throw error;
  }
}

// Ejecutar la inicialización
initializeStockCacheTable()
  .then(() => console.log('Inicialización de DynamoDB completada'))
  .catch(err => {
    console.error('Error en la inicialización de DynamoDB:', err);
    process.exit(1);
  });
