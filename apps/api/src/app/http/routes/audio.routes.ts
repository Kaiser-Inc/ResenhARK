import type { FastifyInstance } from "fastify";
import type { ServerDependencies } from "../../core/server.js";
import { settings } from "../../core/settings.js";
import type { Card } from "../../games/hitline/engine.js";
import { verifyAudioTicket } from "../audio-tickets.js";

type Query = { m?: unknown; t?: unknown };

export async function audioRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
): Promise<void> {
  const { store, audio, fetchAudio } = deps;

  fastify.get<{ Params: { drawId: string }; Querystring: Query }>(
    "/audio/:drawId",
    async (request, reply) => {
      // Every failure is the same 404: never reveal which check failed.
      const notFound = () => reply.status(404).send({ error: "not-found" });
      try {
        const { drawId } = request.params;
        const { m, t } = request.query;
        if (typeof m !== "string" || typeof t !== "string") return notFound();
        if (!verifyAudioTicket(settings.SESSION_SECRET, drawId, m, t)) return notFound();
        const code = await store.roomOfDraw(drawId);
        const room = code ? await store.load(code) : null;
        // Room.game is typed null until the game wiring lands.
        const game = room?.game as { state?: { draw?: { id: string; card: Card } | null } } | null;
        const card = game?.state?.draw?.id === drawId ? game.state.draw.card : null;
        if (!room || !card || !room.members.some((member) => member.id === m)) return notFound();
        const url = await audio.findPreviewUrl(card);
        if (!url) return notFound();
        const upstream = await fetchAudio(url);
        if (!upstream.ok) return notFound();
        const length = upstream.headers.get("content-length");
        reply
          .header("content-type", upstream.headers.get("content-type") ?? "audio/mpeg")
          .header("cache-control", "no-store");
        if (length) reply.header("content-length", length);
        return reply.send(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        return notFound();
      }
    },
  );
}
