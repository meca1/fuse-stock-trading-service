const AWS = require('aws-sdk');

// Configuración para DynamoDB local
const dynamoConfig = {
  region: process.env.DYNAMODB_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://dynamodb:8000',
  accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'LOCAL_FAKE_KEY',
  secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'LOCAL_FAKE_SECRET'
};

// Crear instancia de DynamoDB
const dynamoDB = new AWS.DynamoDB(dynamoConfig);

// Función para listar las tablas
async function listTables() {
  try {
    const result = await dynamoDB.listTables().promise();
    console.log('Tablas disponibles en DynamoDB:');
    result.TableNames.forEach((tableName, index) => {
      console.log(`${index + 1}. ${tableName}`);
    });
  } catch (error) {
    console.error('Error al listar las tablas:', error);
  }
}

// Ejecutar la función
listTables(); 