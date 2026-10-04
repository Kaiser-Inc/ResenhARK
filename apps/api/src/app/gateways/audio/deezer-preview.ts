import type { AudioPreviewSource } from "../ports/audio-preview-source.js";

export class DeezerPreview implements AudioPreviewSource {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async findPreviewUrl(
    card: Parameters<AudioPreviewSource["findPreviewUrl"]>[0],
  ): Promise<string | null> {
    if (!card.isrc) return null;
    try {
      const res = await this.fetchFn(
        `https://api.deezer.com/track/isrc:${encodeURIComponent(card.isrc)}`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { preview?: unknown };
      return typeof body.preview === "string" && body.preview ? body.preview : null;
    } catch {
      return null;
    }
  }
}
