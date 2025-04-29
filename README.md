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
   DB_PORT=5433          # PostgreSQL puerto 5433 en Docker Compose
   DB_NAME=stock_trading
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DATABASE_URL=postgres://postgres:postgres@localhost:5433/stock_trading?sslmode=disable
   
   # DynamoDB Configuration (para caché de tokens)
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
   # IMPORTANTE: Para desarrollo local usar 'smtp', para producción usar 'ses'
   EMAIL_PROVIDER=smtp   # Obligatorio: 'smtp' para desarrollo, 'ses' para producción
   EMAIL_SENDER=reports@localhost
   REPORT_RECIPIENTS=admin@example.com
   
   # SMTP settings (para desarrollo local con MailHog)
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_AUTH=false
   SMTP_USER=
   SMTP_PASSWORD=
   
   # AWS settings (para producción)
   # En producción, configurar las credenciales de AWS para SES:
   # AWS_ACCESS_KEY_ID=
   # AWS_SECRET_ACCESS_KEY=
   ```

   > **IMPORTANTE**: Para el envío de correos en entorno local, es crítico configurar `EMAIL_PROVIDER=smtp`. De lo contrario, el sistema intentará usar AWS SES y fallará con error de credenciales.

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

### 4. Initialize Stock Tokens

Before using the main endpoints, you need to initialize the stock tokens in DynamoDB. This is required for the caching system to work properly:

```bash
# For local development with DynamoDB Local:
curl -X POST "http://localhost:3000/dev/update-stock-tokens" \
  -H "x-api-key: your_api_key_here"

# If you encounter authentication errors, try running:
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local npm run dynamodb:init
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local serverless invoke local --function updateStockTokens
```

This endpoint will fetch stock data from the vendor API and store tokens in DynamoDB for efficient pagination and caching. Without running this endpoint first, the stock listing and purchase endpoints may not work correctly.

The endpoint is also scheduled to run automatically every day at 00:00 UTC in production to refresh the stock tokens.

### 5. Start the Development Server

Start the local serverless development environment:

```bash
npm run dev
```

The service will now be running at `http://localhost:3000`.

## Testing the Endpoints

> **IMPORTANT**: Make sure you've initialized the stock tokens by running the `update-stock-tokens` endpoint as mentioned in step 4 before testing these endpoints.

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

Para generar un reporte para la fecha ACTUAL (por defecto):

```bash
curl -X POST "http://localhost:3000/dev/generate-report"
```

Para generar un reporte para una fecha específica:

```bash
curl -X POST "http://localhost:3000/dev/generate-report?date=2025-04-28"
```

También puedes usar los scripts proporcionados:

```bash
node scripts/local/quick-report.js
```

### Fechas y Zonas Horarias

El sistema utiliza UTC para todas las operaciones relacionadas con fechas:

- Las transacciones se almacenan con timestamps UTC en la base de datos
- Los reportes diarios buscan transacciones de 00:00:00 UTC a 23:59:59 UTC del día especificado
- Por defecto, el endpoint `/generate-report` usa la fecha actual, no la de ayer

### Configuración de Email para Reportes

Para que el envío de reportes por email funcione correctamente:

1. En entorno local:
   - Asegúrate de que `EMAIL_PROVIDER=smtp` en tu archivo `.env`
   - MailHog debe estar en ejecución (incluido en el docker-compose)
   - Los reportes se pueden ver en `http://localhost:8025`

2. En producción:
   - Configura `EMAIL_PROVIDER=ses` 
   - Proporciona credenciales AWS válidas con permisos para SES
   - Verifica las direcciones de correo en AWS SES antes de enviar

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
- Verify database port is 5433 (not 5432)

### Email Sending Issues
- Check MailHog is running (`http://localhost:8025`)
- Verify `EMAIL_PROVIDER=smtp` is set in `.env` file
- El problema más común es que el sistema intenta usar AWS SES cuando debería usar SMTP local

### Problemas con Fechas en Reportes
- Si el reporte muestra "0 transactions" aunque hay transacciones en esa fecha:
  - Verifica que las transacciones estén dentro del rango de horas UTC de esa fecha
  - Asegúrate de que el servidor y la BD estén usando la misma zona horaria (UTC)
  - Usa el parámetro `?date=YYYY-MM-DD` para especificar exactamente la fecha que necesitas

### Resolución de Problemas Comunes
- **Error "InvalidClientTokenId"**: Indica que está intentando usar AWS SES sin credenciales válidas. Solución: cambiar a `EMAIL_PROVIDER=smtp` en el archivo `.env`.
- **Error "No transactions found"**: Verifica la fecha del reporte y asegúrate de que hay transacciones para esa fecha específica en UTC.
- **Error de conexión a Base de Datos**: Asegúrate de usar el puerto 5433 para PostgreSQL, no el puerto 5432 por defecto.