import apiRoutes from "./api/index.js";
import v1Routes from "./v1/index.js";

export default async function routes(fastify) {
    await fastify.register(apiRoutes, { prefix: '/api' });
    await fastify.register(v1Routes, { prefix: '/v1' });

    fastify.setNotFoundHandler(async (request, reply) => {
        const url = request.raw.url || '';
        if (url.startsWith('/api/') || url.startsWith('/v1/')) {
            return reply.code(404).send({ ok: false, message: 'Route not found' });
        }
        return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
}
