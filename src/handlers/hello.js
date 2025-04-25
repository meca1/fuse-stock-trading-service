'use strict';

module.exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Hola! Tu servicio Serverless está funcionando correctamente!',
        input: event,
      },
      null,
      2
    ),
  };
};
