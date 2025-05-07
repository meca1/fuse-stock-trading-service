const { DynamoDBClient, CreateTableCommand, DescribeTimeToLiveCommand, UpdateTimeToLiveCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

// Configuration for Local DynamoDB
const client = new DynamoDBClient({
  endpoint: 'http://dynamodb:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

// Table definitions
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

// Function to create a table
async function createTable(params) {
  try {
    await client.send(new CreateTableCommand(params));
    console.log(`✅ Table ${params.TableName} created successfully`);
    return true;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log(`ℹ️  Table ${params.TableName} already exists`);
      return true;
    } else {
      console.error(`❌ Error creating table ${params.TableName}:`, error.message);
      return false;
    }
  }
}

// Function to check TTL status
async function checkTTLStatus(tableName) {
  try {
    const result = await client.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
    return result.TimeToLiveDescription.TimeToLiveStatus === 'ENABLED';
  } catch (error) {
    console.error(`❌ Error checking TTL for ${tableName}:`, error.message);
    return false;
  }
}

// Function to configure TTL
async function configureTTL(tableName) {
  try {
    const isTTLEnabled = await checkTTLStatus(tableName);
    
    if (isTTLEnabled) {
      console.log(`ℹ️  TTL is already enabled for table ${tableName}`);
      return true;
    }

    await client.send(new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true
      }
    }));
    
    console.log(`✅ TTL configured successfully for table ${tableName}`);
    return true;
  } catch (error) {
    if (error.name === 'ValidationException' && error.message.includes('TimeToLive is already enabled')) {
      console.log(`ℹ️  TTL is already enabled for table ${tableName}`);
      return true;
    }
    console.error(`❌ Error configuring TTL for table ${tableName}:`, error.message);
    return false;
  }
}

// Main function
async function initializeDynamoDB() {
  try {
    // List existing tables
    const existingTables = await client.send(new ListTablesCommand());
    console.log('📋 Existing tables:', existingTables.TableNames.join(', '));

    // Create all tables
    const tableCreationResults = await Promise.all(tables.map(table => createTable(table)));
    const allTablesCreated = tableCreationResults.every(result => result);

    if (!allTablesCreated) {
      console.warn('⚠️  Some tables could not be created');
    }

    // List of tables with TTL
    const tablesWithTTL = ['fuse-stock-cache-local', 'fuse-portfolio-cache-local'];
    
    // Configure TTL for cache tables
    const ttlResults = await Promise.all(
      tablesWithTTL.map(tableName => configureTTL(tableName))
    );
    
    const allTTLConfigured = ttlResults.every(result => result);
    
    if (!allTTLConfigured) {
      console.warn('⚠️  Some tables could not be configured with TTL');
    }

    console.log('✅ DynamoDB initialization completed');
  } catch (error) {
    console.error('❌ Error during initialization:', error.message);
    process.exit(1);
  }
}

// Run initialization
initializeDynamoDB(); 