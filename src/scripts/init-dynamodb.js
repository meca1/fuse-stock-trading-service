const AWS = require('aws-sdk');

// Configurar el cliente de DynamoDB
const dynamodb = new AWS.DynamoDB({
  region: process.env.DYNAMODB_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  accessKeyId: 'local',
  secretAccessKey: 'local'
});

const tableName = process.env.DYNAMODB_TABLE || 'stock_tokens-local';

async function createTable() {
  const params = {
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'symbol', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'symbol', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  };

  try {
    console.log(`Creating DynamoDB table: ${tableName}`);
    await dynamodb.createTable(params).promise();
    console.log(`Table ${tableName} created successfully`);
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log(`Table ${tableName} already exists`);
    } else {
      console.error('Error creating table:', error);
      throw error;
    }
  }
}

createTable(); 