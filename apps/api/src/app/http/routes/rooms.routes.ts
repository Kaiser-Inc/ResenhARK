import { joinRoomInputSchema } from "@resenhark/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ServerDependencies } from "../../core/server.js";
import { type Member, addMember, createRoom, generateRoomCode } from "../../domain/room/room.js";
import type { RoomHub } from "../../realtime/room-hub.js";

const MAX_CODE_ATTEMPTS = 5;

const codeParams = z.object({ code: z.string().transform((code) => code.toUpperCase()) });

export async function roomRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
  hub: RoomHub,
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
      const member = newMember(request.body);
      const ack = await hub.mutate(code, (room) => {
        const result = addMember(room, member, now());
        // addMember only fails with name-taken or room-full here.
        if (!result.ok) {
          return {
            ok: false,
            error: result.error === "not-a-member" ? "invalid-target" : result.error,
          };
        }
        return result;
      });
      if (!ack.ok) {
        return reply.status(ack.error === "room-not-found" ? 404 : 409).send({ error: ack.error });
      }

      const sessionToken = newId();
      await store.createSession(sessionToken, code, member.id);
      return reply.status(201).send({ memberId: member.id, sessionToken });
    },
  );
}
