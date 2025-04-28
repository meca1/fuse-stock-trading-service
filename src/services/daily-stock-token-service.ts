import { VendorApiClient } from './vendor/api-client';
import { StockTokenRepository } from '../repositories/stock-token-repository';
import { DynamoDB } from 'aws-sdk';

export class DailyStockTokenService {
  private isRunning = false;
  private dynamoDb: DynamoDB;

  constructor(
    private stockTokenRepository: StockTokenRepository,
    private vendorApi: VendorApiClient
  ) {
    // Inicializar cliente DynamoDB para verificaciones
    this.dynamoDb = new DynamoDB({
      region: process.env.DYNAMODB_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID || 'local',
        secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || 'local'
      },
      endpoint: process.env.DYNAMODB_ENDPOINT
    });
  }

  /**
   * Verifica si la tabla existe antes de realizar operaciones
   * Método público que puede ser llamado desde otros servicios
   */
  public async checkTableExists(tableName: string): Promise<boolean> {
    try {
      console.log(`Verificando si la tabla ${tableName} existe...`);
      await this.dynamoDb.describeTable({ TableName: tableName }).promise();
      console.log(`¡La tabla ${tableName} existe!`);
      return true;
    } catch (error: any) {
      if (error.code === 'ResourceNotFoundException') {
        console.warn(`La tabla ${tableName} no existe. Creando tabla...`);
        await this.createTable(tableName);
        return true;
      }
      console.error(`Error al verificar la tabla ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Crea la tabla si no existe
   */
  private async createTable(tableName: string): Promise<void> {
    try {
      await this.dynamoDb.createTable({
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'symbol', KeyType: 'HASH' }
        ],
        AttributeDefinitions: [
          { AttributeName: 'symbol', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      }).promise();
      
      // Esperar a que la tabla esté activa
      let tableActive = false;
      while (!tableActive) {
        console.log(`Waiting for table ${tableName} to become active...`);
        const response = await this.dynamoDb.describeTable({ TableName: tableName }).promise();
        if (response.Table && response.Table.TableStatus === 'ACTIVE') {
          tableActive = true;
          console.log(`Table ${tableName} is now active`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error: any) {
      console.error(`Error creating table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Actualiza los tokens de stock con manejo de errores robusto
   */
  public async updateStockTokens(): Promise<void> {
    if (this.isRunning) {
      console.log('Actualización ya en progreso');
      return;
    }

    this.isRunning = true;
    console.log('Iniciando actualización diaria de tokens de acciones');

    try {
      // Obtener nombre de tabla del repositorio
      const tableName = process.env.DYNAMODB_TABLE || 'fuse-stock-tokens-dev';
      
      // Verificar si la tabla existe
      const tableExists = await this.checkTableExists(tableName);
      if (!tableExists) {
        throw new Error(`La tabla ${tableName} no existe y no se pudo crear`);
      }

      let currentToken: string | undefined;
      const processedSymbols = new Set<string>();
      const failedSymbols: string[] = [];

      do {
        console.log(`Obteniendo lote de acciones${currentToken ? ' con token' : ''}...`);
        const response = await this.vendorApi.listStocks(currentToken);
        const stocks = response.data.items;
        const nextToken = response.data.nextToken;
        
        console.log(`Procesando lote de ${stocks.length} acciones...`);

        // Procesar en lotes más grandes para cubrir más stocks
        const batchSize = 25;
        for (let i = 0; i < stocks.length; i += batchSize) {
          const batch = stocks.slice(i, i + batchSize);
          
          await Promise.all(
            batch.map(async (stock) => {
              if (!processedSymbols.has(stock.symbol)) {
                try {
                  // Guardamos el token de la página donde se encontró el stock
                  await this.stockTokenRepository.saveToken(stock.symbol, currentToken || '');
                  processedSymbols.add(stock.symbol);
                } catch (error: any) {
                  console.error(`Error al guardar token para ${stock.symbol}:`, error);
                  failedSymbols.push(stock.symbol);
                  // No propagar el error para que otros símbolos continúen procesándose
                }
              }
            })
          );
        }

        currentToken = nextToken;
      } while (currentToken);

      console.log(`Se actualizaron correctamente los tokens para ${processedSymbols.size} acciones`);
      if (failedSymbols.length > 0) {
        console.warn(`Falló la actualización de tokens para ${failedSymbols.length} acciones: ${failedSymbols.join(', ')}`);
      }
    } catch (error: any) {
      console.error('Error en la actualización de tokens de acciones:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
} 