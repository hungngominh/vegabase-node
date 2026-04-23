import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error, _req, reply) => {
    const traceId = crypto.randomUUID();
    app.log.error({ traceId, error }, 'Unhandled error');
    reply.status(500).send({
      success: false,
      errors: [{ code: 'UNKNOWN', message: 'An unexpected error occurred.' }],
      traceId,
    });
  });
});
