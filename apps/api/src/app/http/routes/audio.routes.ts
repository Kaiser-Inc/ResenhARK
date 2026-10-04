import type { FastifyInstance } from "fastify";
import type { ServerDependencies } from "../../core/server.js";
import { settings } from "../../core/settings.js";
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
        const draw = room?.game?.state.draw;
        const card = draw?.id === drawId ? draw.card : null;
        if (!room || !card || !room.members.some((member) => member.id === m)) return notFound();
        const url = await audio.findPreviewUrl(card);
        if (!url) return notFound();
        const upstream = await fetchAudio(url);
        if (!upstream.ok) return notFound();
        // Buffer first: a failing body must still end as the uniform 404.
        const body = Buffer.from(await upstream.arrayBuffer());
        return reply
          .header("content-type", upstream.headers.get("content-type") ?? "audio/mpeg")
          .header("cache-control", "no-store")
          .header("content-length", body.length)
          .send(body);
      } catch {
        return notFound();
      }
    },
  );
}
