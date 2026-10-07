export interface AudioPreviewSource {
  findPreviewUrl(card: {
    title: string;
    artists: string[];
    isrc: string | null;
    /** Deezer track id, known for the built-in deck. */
    deezerId?: number;
  }): Promise<string | null>;
}
