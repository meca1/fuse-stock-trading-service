# PostgreSQL Initialization Scripts

Este directorio contiene los scripts que se ejecutan automáticamente cuando el contenedor de PostgreSQL se inicia por primera vez.

## Scripts

### `init-db.sh`
- Script principal de inicialización
- Se ejecuta automáticamente al iniciar el contenedor
- Configura:
  - Schema público
  - Permisos básicos
  - Extensiones (uuid-ossp, pgcrypto)
  - Zona horaria (UTC)

## Uso en Desarrollo Local

Este script es parte del proceso de inicialización de Docker y no necesita ser ejecutado manualmente.
Se activa automáticamente cuando:
1. Se construye el contenedor por primera vez
2. Se ejecuta `docker-compose up`

## Notas Importantes

- Este script es SOLO para desarrollo local
- En producción (AWS RDS), estas configuraciones se manejan a través de:
  - Parameter groups de RDS
  - IAM roles y políticas
  - Configuraciones de la instancia RDS 