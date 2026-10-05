import type { AudioPreviewSource } from "../ports/audio-preview-source.js";

/** Sentinel the fixture source returns; main.ts serves a local silent mp3 for it. */
export const FIXTURE_AUDIO_URL = "fixture:silence";

export class FixturePreview implements AudioPreviewSource {
  async findPreviewUrl(): Promise<string | null> {
    return FIXTURE_AUDIO_URL;
  }
}
