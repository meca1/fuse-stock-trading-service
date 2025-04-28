const AWS = require('aws-sdk');

// Configuración para DynamoDB Local
const dynamodb = new AWS.DynamoDB({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  accessKeyId: 'local',
  secretAccessKey: 'local',
});

// Definición de las tablas
const tables = [
  {
    TableName: 'fuse-stock-tokens-local',
    KeySchema: [
      { AttributeName: 'symbol', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'symbol', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'fuse-stock-cache-local',
    KeySchema: [
      { AttributeName: 'key', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'key', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  },
  {
    TableName: 'fuse-portfolio-cache-local',
    KeySchema: [
      { AttributeName: 'key', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'key', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  }
];

// Función para crear una tabla
async function createTable(params) {
  try {
    await dynamodb.createTable(params).promise();
    console.log(`✅ Tabla ${params.TableName} creada exitosamente`);
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log(`⚠️  La tabla ${params.TableName} ya existe`);
    } else {
      console.error(`❌ Error creando tabla ${params.TableName}:`, error);
    }
  }
}

// Función principal
async function initializeDynamoDB() {
  try {
    // Listar tablas existentes
    const existingTables = await dynamodb.listTables().promise();
    console.log('Tablas existentes:', existingTables.TableNames);

    // Crear todas las tablas
    for (const table of tables) {
      await createTable(table);
    }

    // Lista de tablas con TTL
    const tablesWithTTL = ['fuse-stock-cache-local', 'fuse-portfolio-cache-local'];
    
    // Configurar TTL para las tablas de caché
    for (const tableName of tablesWithTTL) {
      if (existingTables.TableNames.includes(tableName)) {
        try {
          await dynamodb.updateTimeToLive({
            TableName: tableName,
            TimeToLiveSpecification: {
              AttributeName: 'ttl',
              Enabled: true
            }
          }).promise();
          console.log(`TTL configurado para la tabla ${tableName}`);
        } catch (err) {
          console.error(`Error configurando TTL para la tabla ${tableName}:`, err);
        }
      }
    }

    console.log('✅ Inicialización de DynamoDB completada');
  } catch (error) {
    console.error('❌ Error durante la inicialización:', error);
    process.exit(1);
  }
}

// Ejecutar la inicialización
initializeDynamoDB(); 