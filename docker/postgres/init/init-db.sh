#!/bin/bash
set -e

# Set up permissions and extensions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create schema
  CREATE SCHEMA IF NOT EXISTS public;
  
  -- Set up permissions
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $POSTGRES_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $POSTGRES_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $POSTGRES_USER;
  
  -- Create useful extensions
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  
  -- Set up timezone
  SET timezone = 'UTC';
  
  -- Add database comment
  COMMENT ON DATABASE $POSTGRES_DB IS 'Stock Trading Service Database for Fuse Finance Challenge';
EOSQL

echo "✅ PostgreSQL initialized with required extensions and configurations"

# Note: The actual migrations will be handled by the dbmate service in docker-compose.yml
# This script only sets up the initial database configuration
