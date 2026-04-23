import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { vegabaseJwtPlugin } from '../plugins/jwt';

describe('vegabaseJwtPlugin', () => {
  it('request_withoutToken_returns401', async () => {
    const app = Fastify();
    await app.register(vegabaseJwtPlugin, { secret: 'test-secret-key-long-enough' });
    app.get('/test', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.statusCode).toBe(401);
  });

  it('request_withValidToken_returns200', async () => {
    const app = Fastify();
    await app.register(vegabaseJwtPlugin, { secret: 'test-secret-key-long-enough' });
    app.get('/test', async () => ({ ok: true }));
    await app.ready();

    const token = app.jwt.sign({ sub: 'user1', roles: ['ADMIN'] });
    const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(200);
  });

  it('request_withExpiredToken_returns401', async () => {
    const app = Fastify();
    await app.register(vegabaseJwtPlugin, { secret: 'test-secret-key-long-enough' });
    app.get('/test', async () => ({ ok: true }));
    await app.ready();

    const nowSec = Math.floor(Date.now() / 1000);
    const token = app.jwt.sign({ sub: 'user1', iat: nowSec - 60, exp: nowSec - 10 });
    const res = await app.inject({ method: 'GET', url: '/test', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ errors: { code: string }[] }>();
    expect(body.errors[0].code).toBe('UNAUTHORIZED');
  });
});
