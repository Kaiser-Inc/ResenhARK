import type { AudioPreviewSource } from "../ports/audio-preview-source.js";

export class DeezerPreview implements AudioPreviewSource {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async findPreviewUrl(
    card: Parameters<AudioPreviewSource["findPreviewUrl"]>[0],
  ): Promise<string | null> {
    // The ISRC lookup may return a release without a preview while another one has it,
    // so a known track id goes first.
    if (card.deezerId != null) {
      const url = await this.fetchPreview(`https://api.deezer.com/track/${card.deezerId}`);
      if (url) return url;
    }
    if (!card.isrc) return null;
    return this.fetchPreview(`https://api.deezer.com/track/isrc:${encodeURIComponent(card.isrc)}`);
  }

  private async fetchPreview(url: string): Promise<string | null> {
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) return null;
      const body = (await res.json()) as { preview?: unknown };
      return typeof body.preview === "string" && body.preview ? body.preview : null;
    } catch {
      return null;
    }
  }
}
