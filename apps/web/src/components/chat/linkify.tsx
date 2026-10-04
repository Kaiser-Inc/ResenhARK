import type { ReactNode } from "react";

const URL_PATTERN = /https?:\/\/\S+/g;
// Punctuation that ends a sentence, not the address.
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Splits text into text nodes and links. Everything stays a React node, never HTML. */
export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING, "");
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-text underline underline-offset-4"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
