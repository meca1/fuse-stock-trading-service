# Docker Configuration

Este directorio contiene todas las configuraciones y scripts relacionados con Docker para el entorno de desarrollo local.

## Estructura

```
docker/
├── postgres/
│   ├── init/           # Scripts de inicialización automática
│   │   ├── init-db.sh  # Configuración inicial de PostgreSQL
│   │   └── README.md   # Documentación de scripts de inicio
│   └── scripts/        # Scripts auxiliares para PostgreSQL
├── dynamodb/
│   └── init/          # Scripts de inicialización de DynamoDB local
└── README.md          # Este archivo
```

## Propósito

Cada subdirectorio tiene un propósito específico:

### PostgreSQL (`postgres/`)
- `init/`: Scripts que se ejecutan automáticamente al iniciar el contenedor
- `scripts/`: Scripts auxiliares para mantenimiento y utilidades

### DynamoDB (`dynamodb/`)
- `init/`: Scripts para configurar DynamoDB local

## Uso

Estos scripts y configuraciones son exclusivamente para desarrollo local.
Para producción, se utilizan servicios administrados de AWS:
- RDS para PostgreSQL
- DynamoDB para las tablas en la nube

# Docker Development Environment

This directory contains Docker configuration for local development of the Fuse Stock Trading Service.

## PostgreSQL Database

The PostgreSQL database is configured to match the production RDS environment, using the same version (13.7) to ensure compatibility.

### Features

- PostgreSQL 13.7 with persistent storage
- PgAdmin web interface for database management
- Automatic initialization scripts
- Environment variable configuration

## Getting Started

1. Make sure you have Docker and Docker Compose installed on your machine
2. From the project root directory, run:

```bash
docker-compose up -d
```

3. The PostgreSQL database will be available at:
   - Host: localhost
   - Port: 5432 (configurable via .env)
   - Username: postgres (configurable via .env)
   - Password: postgres (configurable via .env)
   - Database: fuse_stock_trading_dev (configurable via .env)

4. PgAdmin will be available at [http://localhost:5050](http://localhost:5050)
   - Email: admin@fuse.com
   - Password: admin

## Configuration

You can customize the database configuration by setting environment variables in your `.env` file:

```env
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=fuse_stock_trading_dev
DB_HOST=localhost
DB_PORT=5432
```

## Stopping the Containers

To stop the containers without removing data:

```bash
docker-compose stop
```

To stop and remove the containers (data will be preserved in volumes):

```bash
docker-compose down
```

To completely remove everything including data volumes:

```bash
docker-compose down -v
```

## Database Initialization

The database is automatically initialized with the necessary extensions and schemas when the container starts for the first time. The initialization scripts are located in the `docker/postgres/init` directory.

If you need to add custom initialization scripts, place them in this directory with a `.sql` extension and they will be executed in alphabetical order.
