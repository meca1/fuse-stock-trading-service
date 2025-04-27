const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const dynamoConfig = {
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'LOCAL_FAKE_KEY',
    secretAccessKey: 'LOCAL_FAKE_SECRET'
  }
};

const client = new DynamoDBClient(dynamoConfig);

const createStockTokensTable = async () => {
  const params = {
    TableName: 'stock_tokens-local',
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
  };

  try {
    const data = await client.send(new CreateTableCommand(params));
    console.log('Created table:', data);
    return data;
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log('Table already exists');
      return;
    }
    throw err;
  }
};

const init = async () => {
  try {
    // List existing tables
    const { TableNames } = await client.send(new ListTablesCommand({}));
    console.log('Existing tables:', TableNames);

    // Create tables if they don't exist
    await createStockTokensTable();
    
    console.log('DynamoDB initialization completed');
  } catch (err) {
    console.error('Error initializing DynamoDB:', err);
    process.exit(1);
  }
};

init(); 