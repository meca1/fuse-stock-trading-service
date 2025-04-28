// Script to run daily report without keeping the process running
require('dotenv').config();

// Asegurar que estamos en modo local
process.env.NODE_ENV = 'development';
process.env.EMAIL_PROVIDER = 'smtp';

// Import the lambda handler from the compiled version
const { handler } = require('../../dist/handlers/cron/daily-report');

// Execute report generation
async function runReport() {
  try {
    console.log('Starting manual report generation...');
    
    // Use the current date instead of yesterday
    const today = new Date().toISOString().split('T')[0];
    console.log(`Generating report for TODAY: ${today}`);
    
    // Pass an event with the date as a parameter
    const result = await handler({
      queryStringParameters: {
        date: today
      }
    }, { 
      getRemainingTimeInMillis: () => 30000 
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('Report generated successfully');
    
    // Exit the process after running the report
    process.exit(0);
  } catch (error) {
    console.error('Error executing report:', error);
    process.exit(1);
  }
}

// Run the report immediately
runReport(); 