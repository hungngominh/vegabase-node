import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';

export interface JwtConfig {
  secret: string;
  issuer?: string;
  audience?: string;
  /** Clock-drift tolerance in seconds for `iat`/`exp`/`nbf` validation. Default 30, clamped to [0, 300].
   *  Match production server clock-skew; consumers typically pass `process.env.JWT_CLOCK_SKEW_SECONDS`. */
  clockSkewSeconds?: number;
}

export const vegabaseJwtPlugin = fp(async (app: FastifyInstance, config: JwtConfig) => {
  const rawSkew = config.clockSkewSeconds ?? 30;
  const clockTolerance = Math.max(0, Math.min(300, Number.isFinite(rawSkew) ? rawSkew : 30));

  await app.register(jwtPlugin, {
    secret: config.secret,
    verify: {
      allowedIss: config.issuer,
      allowedAud: config.audience,
      clockTolerance,
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
