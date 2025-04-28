# Fuse Stock Trading Service

Backend service for stock trading operations with an external vendor API.

## Getting Started

These instructions will help you set up and run the project on your local machine for development and testing purposes.

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18.9.0 or later)
- npm (v8.19.1 or later)
- Docker (v27.1.2 or later) and Docker Compose
- AWS CLI (v2.22.12 or later)
- Serverless Framework (v3.40.0 or later, `npm install -g serverless@3.x`)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
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

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=fuse_stocks
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_SSL=false
   
   # Database URL for migrations (required for dbmate)
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/fuse_stocks?sslmode=disable
   
   # DynamoDB Configuration
   DYNAMODB_REGION=us-east-1
   DYNAMODB_ACCESS_KEY_ID=local
   DYNAMODB_SECRET_ACCESS_KEY=local
   DYNAMODB_ENDPOINT=http://localhost:8000
   DYNAMODB_TABLE=fuse-stock-tokens-dev
   
   # Vendor API Configuration
   VENDOR_API_URL=https://api.challenge.fusefinance.com
   VENDOR_API_KEY=your_api_key_here
   
   # Email Configuration
   EMAIL_PROVIDER=smtp
   EMAIL_SENDER=reports@example.com
   REPORT_RECIPIENTS=admin@example.com
   
   # SMTP settings (for local development)
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_AUTH=false
   SMTP_USER=
   SMTP_PASSWORD=
   
   # AWS settings (for production)
   AWS_REGION=us-east-1
   ```

## Running the Service Locally

### 1. Start Local Dependencies

Run the following command to start PostgreSQL, DynamoDB local, and MailHog:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- DynamoDB Local on port 8000
- MailHog (SMTP testing) on ports 1025 (SMTP) and 8025 (Web UI)

### 2. Initialize Database

Run database migrations:

```bash
npm run db:migrate
```

### 3. Initialize DynamoDB Tables

Set up the required DynamoDB tables:

```bash
npm run dynamodb:init
```

### 4. Start the Development Server

Start the local serverless development environment:

```bash
npm run dev
```

The service will now be running at `http://localhost:3000`.

## Testing the Endpoints

Use curl, Postman, or any HTTP client to test the endpoints:

### List Stocks
```bash
curl -X GET "http://localhost:3000/dev/stocks" \
  -H "x-api-key: your_api_key_here"
```

### Get User Portfolios
```bash
curl -X GET "http://localhost:3000/dev/users/123/portfolios" \
  -H "x-api-key: your_api_key_here"
```

### Buy Stock
```bash
curl -X POST "http://localhost:3000/dev/stocks/AAPL/buy" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"portfolioId": "1", "quantity": 10, "price": 150.50}'
```

## Daily Reports

The service includes a feature to generate daily transaction reports and send them by email.

### Running a Report Manually

To generate and send a report for yesterday's transactions:

```bash
npm run report:daily
```

To generate a one-time report and exit:

```bash
node scripts/local/quick-report.js
```

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
- `npm run db:migrate`: Run database migrations
- `npm run dynamodb:init`: Initialize DynamoDB tables
- `npm run report:daily`: Generate and send a daily report
- `npm run report:daily:cron`: Run the report service with cron scheduler

## Troubleshooting

### Local Database Connection Issues
- Ensure Docker is running and containers are up
- Check database credentials in `.env` file
- Verify database port availability

### Email Sending Issues
- Check MailHog is running (`http://localhost:8025`)
- Verify email configuration in `.env` file

### API Response Errors
- Check console logs for detailed error information
- Verify vendor API key is correctly set

## Common Issues and Fixes

### Build Error: ReportData not exported
If you encounter the following error during build (especially when building in Docker):
```
src/services/email-service.ts(3,10): error TS2459: Module '"./report-service"' declares 'ReportData' locally, but it is not exported.
```

This occurs because `email-service.ts` is trying to import the `ReportData` interface from the wrong module. 

**Fix**: Ensure `email-service.ts` imports from `service-types.ts` instead of `report-service.ts`:
```typescript
// Incorrect
import { ReportData } from './report-service';

// Correct
import { ReportData, EmailParams } from './service-types';
```

For a detailed technical explanation of the architecture and design decisions, please refer to [REPORT.md](REPORT.md).

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.
