#!/bin/bash

# =============================================================================
# PostgreSQL Initial Setup Script
# =============================================================================
# Este script se ejecuta automáticamente cuando el contenedor de PostgreSQL
# se inicia por primera vez. Configura:
#   1. Schema público
#   2. Permisos básicos
#   3. Extensiones necesarias
#   4. Configuración de zona horaria
# =============================================================================

set -e

# Create the public schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE SCHEMA IF NOT EXISTS public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
    COMMENT ON DATABASE stock_trading IS 'Stock Trading Service Database';
EOSQL

# Create necessary extensions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOSQL

# Set timezone
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    ALTER DATABASE stock_trading SET timezone TO 'UTC';
EOSQL

echo "✅ PostgreSQL initialized with required extensions and configurations"

# Note: The actual migrations will be handled by the dbmate service in docker-compose.yml
# This script only sets up the initial database configuration
