const AWS = require('aws-sdk');

// Configurar el cliente de DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  accessKeyId: 'local',
  secretAccessKey: 'local'
});

async function scanTable() {
  const params = {
    TableName: 'stock_tokens-local'
  };

  try {
    const result = await dynamodb.scan(params).promise();
    console.log('Items encontrados:', JSON.stringify(result.Items, null, 2));
    console.log('Total de items:', result.Count);
  } catch (error) {
    console.error('Error escaneando la tabla:', error);
  }
}

scanTable(); 