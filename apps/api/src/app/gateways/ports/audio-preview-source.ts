export interface AudioPreviewSource {
  findPreviewUrl(card: {
    title: string;
    artists: string[];
    isrc: string | null;
  }): Promise<string | null>;
}
