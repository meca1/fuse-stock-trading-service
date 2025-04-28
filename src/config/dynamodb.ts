import AWS from 'aws-sdk';

// Configuración para DynamoDB local o en la nube
const isLocal = process.env.IS_OFFLINE || process.env.NODE_ENV === 'development';

// Configuración para DynamoDB
const dynamoConfig: AWS.DynamoDB.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
};

// Si estamos en modo local, configuramos para usar DynamoDB local
if (isLocal) {
  dynamoConfig.endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
  // Credenciales falsas necesarias para DynamoDB local
  dynamoConfig.accessKeyId = 'LOCAL_FAKE_KEY';
  dynamoConfig.secretAccessKey = 'LOCAL_FAKE_SECRET';
}

// Crear instancia de DynamoDB
export const dynamoDB = new AWS.DynamoDB(dynamoConfig);
export const documentClient = new AWS.DynamoDB.DocumentClient(dynamoConfig);

// Nombre de la tabla de caché
export const STOCK_CACHE_TABLE = process.env.STOCK_CACHE_TABLE || 'fuse-stock-cache-local';

// Función para inicializar la tabla de caché si no existe
export const initializeStockCacheTable = async (): Promise<void> => {
  try {
    // Verificar si la tabla ya existe
    const tables = await dynamoDB.listTables().promise();
    if (tables.TableNames?.includes(STOCK_CACHE_TABLE)) {
      console.log(`Tabla ${STOCK_CACHE_TABLE} ya existe`);
      return;
    }

    // Crear tabla
    const params: AWS.DynamoDB.CreateTableInput = {
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

    // Configurar TTL después de crear la tabla
    const ttlParams = {
      TableName: STOCK_CACHE_TABLE,
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true
      }
    };

    await dynamoDB.updateTimeToLive(ttlParams).promise();
    console.log(`TTL configurado para la tabla ${STOCK_CACHE_TABLE}`);
  } catch (error) {
    console.error('Error al inicializar la tabla de caché:', error);
    throw error;
  }
};
