// Script to run daily report using node-cron
require('dotenv').config();

// Asegurar que estamos en modo local
process.env.NODE_ENV = 'development';
process.env.EMAIL_PROVIDER = 'smtp';

const cron = require('node-cron');
const path = require('path');
const { handler } = require('../../dist/handlers/cron/daily-report');

// Simplified event object for local execution
const createEvent = (date = null) => {
  return date ? { queryStringParameters: { date } } : {};
};

// Execute report generation
async function runReport(date = null) {
  try {
    console.log('Starting manual report generation...');
    
    // For today's report
    const today = new Date().toISOString().split('T')[0];
    console.log(`Generating report for TODAY: ${today}`);
    
    // Call the lambda handler directly
    const result = await handler(createEvent(date || today), {});
    
    // Parse the response from the handler
    const response = JSON.parse(result.body);
    
    console.log('Result:', JSON.stringify(response, null, 2));
    console.log('Report generated successfully');
    
    return response;
  } catch (error) {
    console.error('Error executing report:', error);
    throw error;
  }
}

// If run directly, run the report immediately
if (require.main === module) {
  if (process.argv.includes('--now')) {
    console.log('Running report immediately...');
    runReport().catch(console.error);
  } else {
    // Schedule the report to run at 23:59 every day
    cron.schedule('59 23 * * *', () => {
      console.log(`Running scheduled report at ${new Date().toISOString()}`);
      runReport().catch(console.error);
    });
    
    console.log('Report service started. The report will run at 23:59 every day.');
    console.log('Press Ctrl+C to stop the service.');
  }
}

module.exports = { runReport }; 