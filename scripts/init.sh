#!/bin/bash

# Colores para la salida
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Iniciando configuración del proyecto...${NC}"

# Verificar que Docker y Docker Compose estén instalados
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker no está instalado. Por favor, instala Docker primero.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose no está instalado. Por favor, instala Docker Compose primero.${NC}"
    exit 1
fi

# Verificar que Docker esté corriendo
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker no está corriendo. Por favor, inicia Docker primero.${NC}"
    exit 1
fi

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creando archivo .env desde .env.example...${NC}"
    cp .env.example .env
fi

# Iniciar los servicios con Docker Compose
echo -e "${YELLOW}Iniciando servicios con Docker Compose...${NC}"
docker-compose up -d

# Esperar a que PostgreSQL esté listo
echo -e "${YELLOW}Esperando a que PostgreSQL esté listo...${NC}"
while ! docker-compose exec postgres pg_isready -U postgres -d stock_trading; do
    sleep 1
done

# Ejecutar migraciones de la base de datos
echo -e "${YELLOW}Ejecutando migraciones de la base de datos...${NC}"
docker-compose exec app npm run db:migrate

# Inicializar DynamoDB
echo -e "${YELLOW}Inicializando DynamoDB...${NC}"
docker-compose exec app npm run dynamodb:init

echo -e "${GREEN}¡Configuración completada!${NC}"
echo -e "${GREEN}El proyecto está listo para ejecutarse.${NC}"
echo -e "${GREEN}Para iniciar el servidor, ejecuta:${NC}"
echo -e "${GREEN}docker-compose exec app npx serverless offline --stage local${NC}" 