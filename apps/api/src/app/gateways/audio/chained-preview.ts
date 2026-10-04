import type { AudioPreviewSource } from "../ports/audio-preview-source.js";

export class ChainedPreview implements AudioPreviewSource {
  constructor(private readonly sources: AudioPreviewSource[]) {}

  async findPreviewUrl(card: Parameters<AudioPreviewSource["findPreviewUrl"]>[0]) {
    for (const source of this.sources) {
      const url = await source.findPreviewUrl(card);
      if (url) return url;
    }
    return null;
  }
}
