import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

/**
 * Función Lambda de ejemplo que maneja solicitudes de API Gateway
 * @param event - Evento de API Gateway
 * @param context - Contexto de ejecución de Lambda
 * @returns Respuesta formateada para API Gateway
 */
export const handler = async (
  event: APIGatewayProxyEvent, 
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // Log del ID de solicitud de Lambda para seguimiento
    console.log('Request ID:', context.awsRequestId);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          message: 'Hola! Tu servicio Serverless con TypeScript está funcionando correctamente!',
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId,
          input: event,
        },
        null,
        2
      ),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          message: 'Error interno del servidor',
          requestId: context.awsRequestId,
        },
        null,
        2
      ),
    };
  }
};
