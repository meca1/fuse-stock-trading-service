# Fuse Stock Trading Service

A serverless application for stock trading built with AWS Lambda, PostgreSQL, and DynamoDB.

## Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- AWS CLI (for deployment)
- Serverless Framework (`npm install -g serverless@3.x`)

## Local Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development environment:
   ```bash
   docker compose up -d
   ```
   This will start:
   - PostgreSQL database (with automatic migrations)
   - DynamoDB Local
   - DynamoDB Admin (GUI at http://localhost:8001)
   - MailHog (SMTP server at http://localhost:8025)

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Initialize stock tokens (REQUIRED before any stock operations):
```bash
   curl -X POST "http://localhost:3000/local/update-stock-tokens" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

   > **Why is this necessary?**
   > 
   > The stock tokens initialization is a crucial step that:
   > - Fetches the current list of available stocks from the vendor API
   > - Stores them in DynamoDB for efficient caching and pagination
   > - Enables the stock listing and purchase endpoints to work properly
   > - **Required before any stock operations (list, buy, etc.)**
   > 
   > In production, this process is automated:
   > - Runs daily at 00:00 UTC via a scheduled Lambda function
   > - Ensures stock data is always up to date
   > - Maintains a consistent cache of available stocks
   > - Prevents API rate limiting by caching vendor responses
   > 
   > **Troubleshooting**: If you get "Stock not found" errors, make sure you've run this initialization step first.

## Available Scripts

- `npm run dev`: Start the local development server
- `npm run test`: Run tests
- `npm run lint`: Run linter
- `npm run db:migrate:status`: Check migration status
- `npm run db:rollback`: Rollback the last migration
- `npm run deploy`: Deploy to development environment
- `npm run deploy:prod`: Deploy to production environment

## Project Structure

```
.
├── src/
│   ├── handlers/        # Lambda function handlers
│   ├── services/        # Business logic
│   ├── infrastructure/  # Database and external services
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions
├── db/
│   └── migrations/     # Database migrations
├── scripts/
│   └── local/         # Local development scripts
└── tests/             # Test files
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stock_trading?sslmode=disable

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local

# DynamoDB
DYNAMODB_ENDPOINT=http://localhost:8000

# Email
SMTP_HOST=localhost
SMTP_PORT=1025
```

## API Examples

All endpoints require an API key in the `x-api-key` header. Use the following key for testing:
```
nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e
```

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
  -d '{"portfolioId": "1", "quantity": 10, "price": 150.50, "userId": "1"}'
```

### Generate Daily Report
```bash
# Generate report for current date
curl -X POST "http://localhost:3000/local/generate-report" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"

# Generate report for specific date
curl -X POST "http://localhost:3000/local/generate-report?date=2024-03-20" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

### Update Stock Tokens
```bash
curl -X POST "http://localhost:3000/local/update-stock-tokens" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

## Testing

Run the test suite:

```bash
npm test
```

## Deployment

Deploy using the available npm scripts:

```bash
# Deploy to development
npm run deploy

# Deploy to production
npm run deploy:prod
```

## License

MIT