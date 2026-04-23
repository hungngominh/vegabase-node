import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export interface CallerInfo {
  username: string;
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    caller: CallerInfo;
  }
}

const callerStore = new WeakMap<object, CallerInfo>();

export const callerInfoPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('caller', {
    getter(this: object): CallerInfo {
      return callerStore.get(this) ?? { username: 'unknown', roles: [] };
    },
    setter(this: object, value: CallerInfo) {
      callerStore.set(this, value);
    },
  });

  app.addHook('preHandler', async req => {
    const payload = req.user as { sub?: string; roles?: string[] };
    const caller: CallerInfo = Object.freeze({
      username: payload?.sub ?? 'unknown',
      roles: payload?.roles ?? [],
    });
    req.caller = caller;
  });
});
