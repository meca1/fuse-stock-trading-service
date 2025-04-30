# Fuse Stock Trading Service

Backend service for stock trading operations with an external vendor API.

## Getting Started

These instructions will help you set up and run the project on your local machine for development and testing purposes.

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18.9.0)
- npm (v8.19.1 or later)
- Docker (v27.1.2 or later) and Docker Compose
- AWS CLI (v2.22.12)
- Serverless Framework (v3.40.0 or later, `npm install -g serverless@3.x`)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/meca1/fuse-stock-trading-service.git
   cd fuse-stock-trading-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your configuration values:
   ```
   # Node environment
   NODE_ENV=development

   # Database Configuration (PostgreSQL)
   DB_HOST=localhost
   DB_PORT=5432          # PostgreSQL port 5432 in Docker Compose
   DB_NAME=stock_trading
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/stock_trading?sslmode=disable
   
   # DynamoDB Configuration (for token caching)
   DYNAMODB_ENDPOINT=http://localhost:8000
   USE_DYNAMODB_CACHE=true
   
   # AWS credentials for local development with DynamoDB Local
   AWS_ACCESS_KEY_ID=local
   AWS_SECRET_ACCESS_KEY=local
   AWS_REGION=us-east-1
   
   # Vendor API Configuration
   VENDOR_API_URL=https://api.challenge.fusefinance.com
   VENDOR_API_KEY=nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e
   
   # Email Configuration
   # IMPORTANT: Use 'smtp' for local development, 'ses' for production
   EMAIL_PROVIDER=smtp   # Required: 'smtp' for development, 'ses' for production
   EMAIL_SENDER=reports@localhost
   REPORT_RECIPIENTS=admin@example.com
   
   # SMTP settings (for local development with MailHog)
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_AUTH=false
   SMTP_USER=
   SMTP_PASSWORD=
   
   # AWS settings (for production)
   # In production, configure AWS credentials for SES:
   # AWS_ACCESS_KEY_ID=
   # AWS_SECRET_ACCESS_KEY=
   ```

   > **IMPORTANT**: For email sending in local environments, it's critical to configure `EMAIL_PROVIDER=smtp`. Otherwise, the system will try to use AWS SES and will fail with credential errors.

## Running the Service Locally

### 1. Start Local Dependencies

Run the following command to start PostgreSQL, DynamoDB local, and MailHog:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432 (with automatic migrations)
- DynamoDB Local on port 8000
- MailHog (SMTP testing) on ports 1025 (SMTP) and 8025 (Web UI)

> **NOTE**: The PostgreSQL database is automatically initialized with all necessary migrations through Docker Compose. It's not necessary to run migrations manually in local environment.

### 2. Initialize DynamoDB Tables

Set up the required DynamoDB tables:

```bash
npm run dynamodb:init
```

### 3. Initialize Stock Tokens

Before using the main endpoints, you need to initialize the stock tokens in DynamoDB. This is required for the caching system to work properly.

The most reliable way to do this is directly within the Docker container:

```bash
docker-compose run --rm app npx serverless invoke local --function updateStockTokens --data '{}' --stage local
```

This command:
- Runs the lambda in the app container with all dependencies configured
- Passes an empty object as the event data (required for schema validation) 
- Uses the local stage configuration

Alternative methods:
```bash
# HTTP endpoint (when server is running):
curl -X POST "http://localhost:3000/dev/update-stock-tokens" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

```bash
# Direct serverless invocation:
serverless invoke local --function updateStockTokens --data '{}' --stage local

```

When successful, the lambda will fetch stock data from the vendor API and store tokens in DynamoDB for efficient pagination and caching. Without this initialization, stock listing and purchase endpoints may not work correctly.

This process is automatically scheduled to run daily at 00:00 UTC in production environments.

### 4. Start the Development Server

Start the local serverless development environment:

```bash
npm run dev
```

The service will now be running at `http://localhost:3000`.

## Testing the Endpoints

> **IMPORTANT**: Make sure you've initialized the stock tokens by running the `update-stock-tokens` endpoint as mentioned in step 3 before testing these endpoints.

### API Authentication

All endpoints require authentication using an API key. You must include the API key in the `x-api-key` header with every request.

The API key to use is:

```plaintext
VENDOR_API_KEY=nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e
```

Without a valid API key, all requests will be rejected with a 401 Unauthorized error.

### Postman Collection

To facilitate testing, you can import the following Postman collection that includes all endpoints correctly configured:

```plaintext
https://api.postman.com/collections/42445248-45a26c8e-a01c-4e76-8490-cbb7b35bc4ba?access_key=PMAT-01JSZ7WJSBZBYEHGZ1Q9GXYE4S
```

To import the collection in Postman:

1. Open Postman
2. Click on "Import" in the upper left corner
3. Select the "Link" tab
4. Paste the URL above
5. Click on "Import"

All endpoints in the collection already have the correct API key configured.

Alternatively, you can use curl or another HTTP client to test the endpoints manually:

### List Stocks
```bash
curl -X GET "http://localhost:3000/local/stocks" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

### Get User Portfolios
```bash
curl -X GET "http://localhost:3000/local/users/1/portfolios" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

### Buy Stock
```bash
curl -X POST "http://localhost:3000/local/stocks/AAPL/buy" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e" \
  -H "Content-Type: application/json" \
  -d '{"portfolioId": "1", "quantity": 10, "price": 150.50}'
```

## Daily Reports

The service includes a feature to generate daily transaction reports and send them by email.

### Running a Report Manually

To generate a report for the CURRENT date (default):

```bash
curl -X POST "http://localhost:3000/dev/generate-report" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

To generate a report for a specific date:

```bash
curl -X POST "http://localhost:3000/dev/generate-report?date=2025-04-28" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

You can also use the provided scripts:

```bash
node scripts/local/quick-report.js
```

### Dates and Time Zones

The system uses UTC for all date-related operations:

- Transactions are stored with UTC timestamps in the database
- Daily reports search for transactions from 00:00:00 UTC to 23:59:59 UTC of the specified day
- By default, the `/generate-report` endpoint uses the current date, not yesterday's

### Email Configuration for Reports

For email reports to work correctly:

1. In local environment:
   - Make sure `EMAIL_PROVIDER=smtp` is set in your `.env` file
   - MailHog must be running (included in docker-compose)
   - Reports can be viewed at `http://localhost:8025`

2. In production:
   - Configure `EMAIL_PROVIDER=ses`
   - Provide valid AWS credentials with SES permissions
   - Verify email addresses in AWS SES before sending

### Viewing Generated Reports

When running locally, all emails are sent to MailHog. Open the following URL in your browser to view them:

```
http://localhost:8025
```

### Running Only MailHog Email Service

If you need to start only the MailHog service (for example, after clearing Docker containers):

```bash
docker-compose up -d mailhog
```

MailHog provides:
- A simple SMTP server that captures all outgoing emails (listening on port 1025)
- A web interface to view captured emails (accessible at http://localhost:8025)
- Search and filtering capabilities for emails
- HTML and plain text email viewing
- JSON API for automated testing

No configuration is needed as the application is already set up to use MailHog as the email provider when running in development mode.

## Running Tests

Run unit tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Deployment

### Configure AWS Credentials

```bash
aws configure
```

### Deploy to Development Environment

```bash
npm run deploy:dev
```

### Deploy to Production Environment

Before deploying to production, you must run the database migrations:

```bash
npm run db:migrate
```

Then, you can deploy the application:

```bash
npm run deploy:prod
```

Or manually:

```bash
serverless deploy --stage prod
```

## Available Scripts

- `npm run dev`: Run the service locally
- `npm run build`: Build the TypeScript code
- `npm test`: Run unit tests
- `npm run lint`: Run linting checks
- `npm run db:init`: Initialize the database
- `npm run db:migrate`: Run database migrations (only necessary for production)
- `npm run dynamodb:init`: Initialize DynamoDB tables
- `npm run report:daily`: Generate and send a daily report
- `npm run report:daily:cron`: Run the report service with cron scheduler

## Troubleshooting

### Local Database Connection Issues
- Ensure Docker is running and containers are up
- Check database credentials in `.env` file
- Verify database port is 5432

### Email Sending Issues
- Check MailHog is running (`http://localhost:8025`)
- Verify `EMAIL_PROVIDER=smtp` is set in `.env` file
- The most common problem is that the system tries to use AWS SES when it should use local SMTP

### Date Issues in Reports
- If the report shows "0 transactions" even though there are transactions on that date:
  - Verify that the transactions are within the UTC hour range for that date
  - Make sure the server and DB are using the same timezone (UTC)
  - Use the `?date=YYYY-MM-DD` parameter to specify exactly the date you need

### Common Problem Resolution
- **"InvalidClientTokenId" Error**: Indicates that it's trying to use AWS SES without valid credentials. Solution: change to `EMAIL_PROVIDER=smtp` in the `.env` file.
- **"No transactions found" Error**: Verify the report date and make sure there are transactions for that specific date in UTC.
- **Database Connection Error**: Make sure to use port 5432 for PostgreSQL.