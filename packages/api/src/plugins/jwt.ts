import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';

export interface JwtConfig {
  secret: string;
  issuer?: string;
  audience?: string;
}

export const vegabaseJwtPlugin = fp(async (app: FastifyInstance, config: JwtConfig) => {
  await app.register(jwtPlugin, {
    secret: config.secret,
    verify: {
      allowedIss: config.issuer,
      allowedAud: config.audience,
    },
  });

  app.addHook('onRequest', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({
        success: false,
        errors: [{ code: 'UNAUTHORIZED', message: 'Invalid or missing token.' }],
        traceId: crypto.randomUUID(),
      });
    }
  });
});
