const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  accessKeyId: 'local',
  secretAccessKey: 'local'
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

async function scanTable() {
  try {
    const params = {
      TableName: 'stock_tokens-local'
    };

    const result = await dynamodb.scan(params).promise();
    console.log('Found items:', JSON.stringify(result.Items, null, 2));
    console.log('Total count:', result.Count);
  } catch (error) {
    console.error('Error scanning table:', error);
  }
}

scanTable(); 