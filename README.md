# Fuse Stock Trading Service

Backend service for stock trading operations. This service integrates with an external API to list available stocks, manage user portfolios, and execute stock purchase transactions.

## Features

- List available stocks with pagination and search
- Get user portfolios
- Execute stock purchase transactions
- Generate and send daily reports by email

## Architecture

The service is built with:

- **Node.js & TypeScript**: Base language and static typing
- **Serverless Framework**: Infrastructure as code for AWS Lambda
- **DynamoDB**: NoSQL database for storage
- **AWS Lambda**: Functions as a service for processing

## Prerequisites

Before starting, make sure you have installed:

- Node.js (v14+)
- npm or yarn
- Docker and Docker Compose (for local development)
- AWS CLI (for deployment)
- Serverless Framework (`npm install -g serverless`)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd fuse-stock-trading-service
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy the environment variables file:
   ```
   cp .env.example .env
   ```

4. Modify the `.env` file with your values:
   ```
   VENDOR_API_KEY=nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e
   DYNAMODB_ENDPOINT=http://localhost:8000
   DYNAMODB_REGION=us-east-1
   DYNAMODB_ACCESS_KEY_ID=local
   DYNAMODB_SECRET_ACCESS_KEY=local
   DYNAMODB_TABLE=fuse-stock-tokens-local
   STOCK_CACHE_TABLE=fuse-stock-cache-local
   ```

## Database Configuration

1. Start local DynamoDB with Docker:
   ```
   docker-compose up -d
   ```

2. Create tables using migrations:
   ```
   npm run migrate:up
   ```

## Run Locally

1. Start the development server:
   ```
   npm run dev
   ```

2. The service will be available at `http://localhost:3000`

### Test endpoints locally

To list stocks:
```
curl -X GET "http://localhost:3000/stocks" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

To search for specific stocks:
```
curl -X GET "http://localhost:3000/stocks?search=AAPL" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

To paginate results:
```
curl -X GET "http://localhost:3000/stocks?nextToken=TOKEN_HERE" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e"
```

To buy stocks:
```
curl -X POST "http://localhost:3000/stocks/AAPL/buy" \
  -H "x-api-key: nSbPbFJfe95BFZufiDwF32UhqZLEVQ5K4wdtJI2e" \
  -H "Content-Type: application/json" \
  -d '{"price": 150.50, "quantity": 10}'
```

## Testing

Run unit tests:
```
npm test
```

Run tests with coverage:
```
npm run test:coverage
```

## Deployment

1. Configure your AWS credentials:
   ```
   aws configure
   ```

2. Deploy the service:
   ```
   npm run deploy
   ```
   
   Or manually:
   ```
   serverless deploy --stage prod
   ```

## Project Structure

```
fuse-stock-trading-service/
├── src/                      # Source code
│   ├── config/               # Configuration
│   ├── handlers/             # Lambda handlers
│   │   ├── cron/             # Scheduled tasks
│   │   ├── portfolios/       # Portfolio endpoints
│   │   └── stocks/           # Stock endpoints
│   ├── middleware/           # Lambda middleware
│   ├── repositories/         # Data access layer
│   ├── services/             # Business logic
│   │   └── vendor/           # External API integration
│   ├── types/                # Type definitions
│   └── utils/                # Utilities
├── db/
│   └── migrations/           # Database migrations
├── scripts/                  # Utility scripts
├── serverless.yml           # Serverless configuration
└── .env                     # Local environment variables
```

## Monitoring

- Logs are available in CloudWatch Logs
- A caching system was implemented to improve performance
- The service includes error handling for external API failure cases

## Development Environment

The project includes:

- ESLint and Prettier for code formatting
- Husky for git hooks
- Jest for testing
- Docker Compose for local services

## License

This project is private.

---

Developed for Fuse Finance as part of the technical evaluation process.
