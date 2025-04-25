# Fuse Stock Trading Service

Un servicio básico construido con Serverless Framework para AWS Lambda.

## Requisitos previos

- Node.js (v18.x o superior)
- Cuenta de AWS y credenciales configuradas
- Serverless Framework

## Instalación

```bash
npm install
```

## Comandos disponibles

- `npm run dev`: Inicia el servidor local para desarrollo
- `npm run deploy`: Despliega el servicio en AWS
- `npm run deploy:prod`: Despliega el servicio en el entorno de producción

## Estructura del proyecto

```
.
├── serverless.yml     # Configuración de Serverless
├── package.json       # Dependencias y scripts
└── src/
    └── handlers/      # Funciones Lambda
        └── hello.js   # Función de ejemplo
```

## Desarrollo local

Para iniciar el servidor de desarrollo local:

```bash
npm run dev
```

## Despliegue

Para desplegar en el entorno de desarrollo:

```bash
npm run deploy
```

Para desplegar en producción:

```bash
npm run deploy:prod
```
