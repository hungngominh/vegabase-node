import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodSchema } from 'zod';
import { successResponse, failResponse, type BaseEntity } from '@vegabase/core';
import type { BaseService, BaseParamModel } from '@vegabase/service';
import type { CallerInfo } from '../plugins/caller-info';

const STATUS_MAP: Record<string, number> = {
  VALIDATION: 400,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  DUPLICATE_KEY: 409,
  DB_TIMEOUT: 503,
  UNKNOWN: 500,
};

function errorsToStatus(errors: { code: string }[]): number {
  return STATUS_MAP[errors[0]?.code ?? 'UNKNOWN'] ?? 500;
}

function buildParam<TParam extends BaseParamModel>(
  req: FastifyRequest & { caller: CallerInfo },
  clientData: unknown,
  schema: ZodSchema<TParam>,
): TParam {
  const parsed = schema.parse(clientData);
  return {
    ...parsed,
    callerUsername: req.caller.username,
    callerRoles: req.caller.roles,
  };
}

export interface BaseControllerOptions<TModel extends BaseEntity, TParam extends BaseParamModel> {
  service: BaseService<TModel, TParam>;
  prefix: string;
  schemas: {
    list?: ZodSchema<TParam>;
    add: ZodSchema<TParam>;
    update: ZodSchema<TParam>;
    delete?: ZodSchema<TParam>;
  };
}

export function createBaseController<TModel extends BaseEntity, TParam extends BaseParamModel>(
  options: BaseControllerOptions<TModel, TParam>,
): FastifyPluginAsync {
  return async app => {
    const req = (r: FastifyRequest) => r as FastifyRequest & { caller: CallerInfo };

    app.get(`${options.prefix}/list`, async (r, reply) => {
      const traceId = crypto.randomUUID();
      const schema = options.schemas.list ?? options.schemas.add;
      const param = buildParam(req(r), r.query, schema);
      const result = await options.service.getList(param);
      if (!result.ok) return reply.status(errorsToStatus(result.errors)).send(failResponse(result.errors, traceId));
      return reply.send(successResponse(result.data, traceId));
    });

    app.post(`${options.prefix}/add`, async (r, reply) => {
      const traceId = crypto.randomUUID();
      const param = buildParam(req(r), r.body, options.schemas.add);
      const result = await options.service.add(param);
      if (!result.ok) return reply.status(errorsToStatus(result.errors)).send(failResponse(result.errors, traceId));
      return reply.status(201).send(successResponse(result.data, traceId));
    });

    app.put(`${options.prefix}/update-field`, async (r, reply) => {
      const traceId = crypto.randomUUID();
      const param = buildParam(req(r), r.body, options.schemas.update);
      const result = await options.service.updateField(param);
      if (!result.ok) return reply.status(errorsToStatus(result.errors)).send(failResponse(result.errors, traceId));
      return reply.send(successResponse(result.data, traceId));
    });

    app.delete(`${options.prefix}/delete`, async (r, reply) => {
      const traceId = crypto.randomUUID();
      const schema = options.schemas.delete ?? options.schemas.update;
      const param = buildParam(req(r), r.query, schema);
      const result = await options.service.delete(param);
      if (!result.ok) return reply.status(errorsToStatus(result.errors)).send(failResponse(result.errors, traceId));
      return reply.send(successResponse(result.data, traceId));
    });
  };
}
