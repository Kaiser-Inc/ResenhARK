import { joinRoomInputSchema } from "@resenhark/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ServerDependencies } from "../../core/server.js";
import { type Member, addMember, createRoom, generateRoomCode } from "../../domain/room/room.js";

const MAX_CODE_ATTEMPTS = 5;

const codeParams = z.object({ code: z.string().transform((code) => code.toUpperCase()) });

export async function roomRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
): Promise<void> {
  const { store, now, rng, newId } = deps;
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const newMember = (input: z.infer<typeof joinRoomInputSchema>): Member => ({
    id: newId(),
    name: input.name,
    avatar: input.avatar,
    joinedAt: now(),
    connections: 0,
    offlineSince: null,
  });

  app.post("/rooms", { schema: { body: joinRoomInputSchema } }, async (request, reply) => {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode(rng);
      if (await store.exists(code)) continue;
      const owner = newMember(request.body);
      const sessionToken = newId();
      await store.save(createRoom(code, owner, now()));
      await store.createSession(sessionToken, code, owner.id);
      return reply.status(201).send({ code, memberId: owner.id, sessionToken });
    }
    throw new Error("could not allocate a free room code");
  });

  app.get("/rooms/:code", { schema: { params: codeParams } }, async (request, reply) => {
    if (!(await store.exists(request.params.code))) {
      return reply.status(404).send({ error: "room-not-found" });
    }
    return { code: request.params.code };
  });

  app.post(
    "/rooms/:code/members",
    { schema: { params: codeParams, body: joinRoomInputSchema } },
    async (request, reply) => {
      const { code } = request.params;
      const room = await store.load(code);
      if (!room) return reply.status(404).send({ error: "room-not-found" });

      const member = newMember(request.body);
      const result = addMember(room, member, now());
      if (!result.ok) return reply.status(409).send({ error: result.error });

      const sessionToken = newId();
      await store.save(result.room);
      await store.createSession(sessionToken, code, member.id);
      return reply.status(201).send({ memberId: member.id, sessionToken });
    },
  );
}
