import type { AudioPreviewSource } from "../ports/audio-preview-source.js";

export class ItunesPreview implements AudioPreviewSource {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async findPreviewUrl(
    card: Parameters<AudioPreviewSource["findPreviewUrl"]>[0],
  ): Promise<string | null> {
    const term = encodeURIComponent(`${card.artists.join(" ")} ${card.title}`);
    try {
      const res = await this.fetchFn(
        `https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=BR`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { results?: { previewUrl?: unknown }[] };
      for (const r of body.results ?? []) {
        if (typeof r.previewUrl === "string" && r.previewUrl) return r.previewUrl;
      }
      return null;
    } catch {
      return null;
    }
  }
}
