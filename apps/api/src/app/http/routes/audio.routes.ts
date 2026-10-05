import type { FastifyInstance } from "fastify";
import type { ServerDependencies } from "../../core/server.js";
import { settings } from "../../core/settings.js";
import { verifyAudioTicket } from "../audio-tickets.js";

type Query = { m?: unknown; t?: unknown };
type Preview = { bytes: Buffer; type: string };

// ponytail: in-memory per instance; LRU of 20 draws (each <= 2 MB). Shared cache needs Redis if we scale out.
const MAX_CACHED_DRAWS = 20;

/** Parses a single `bytes=a-b` range. null = ignore the header (serve 200); "invalid" = 416. */
function parseRange(header: string | undefined, size: number): [number, number] | "invalid" | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === "" && m[2] === "")) return header?.startsWith("bytes=") ? "invalid" : null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start >= size || start > end ? "invalid" : [start, end];
}

export async function audioRoutes(
  fastify: FastifyInstance,
  deps: ServerDependencies,
): Promise<void> {
  const { store, audio, fetchAudio } = deps;
  // Promises, so concurrent first requests for a draw share one provider lookup and download.
  const cache = new Map<string, Promise<Preview | null>>();

  async function resolvePreview(card: Parameters<typeof audio.findPreviewUrl>[0]) {
    const url = await audio.findPreviewUrl(card);
    if (!url) return null;
    const upstream = await fetchAudio(url);
    if (!upstream.ok) return null;
    // Buffer first: a failing body must still end as the uniform 404.
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length === 0) return null;
    return { bytes, type: upstream.headers.get("content-type") ?? "audio/mpeg" };
  }

  function preview(drawId: string, card: Parameters<typeof audio.findPreviewUrl>[0]) {
    const hit = cache.get(drawId);
    if (hit) {
      cache.delete(drawId); // refresh LRU position
      cache.set(drawId, hit);
      return hit;
    }
    const pending = resolvePreview(card).then(
      (value) => {
        if (!value) cache.delete(drawId); // failures are not cached: the next request retries
        return value;
      },
      (err) => {
        cache.delete(drawId);
        throw err;
      },
    );
    cache.set(drawId, pending);
    if (cache.size > MAX_CACHED_DRAWS) cache.delete(cache.keys().next().value as string);
    return pending;
  }

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
        const found = await preview(drawId, card);
        if (!found) return notFound();
        const { bytes, type } = found;
        reply.header("content-type", type).header("cache-control", "no-store");
        reply.header("accept-ranges", "bytes");
        const range = parseRange(request.headers.range, bytes.length);
        if (range === "invalid") {
          return reply.status(416).header("content-range", `bytes */${bytes.length}`).send();
        }
        if (!range) return reply.header("content-length", bytes.length).send(bytes);
        const [start, end] = range;
        return reply
          .status(206)
          .header("content-range", `bytes ${start}-${end}/${bytes.length}`)
          .header("content-length", end - start + 1)
          .send(bytes.subarray(start, end + 1));
      } catch {
        return notFound();
      }
    },
  );
}
