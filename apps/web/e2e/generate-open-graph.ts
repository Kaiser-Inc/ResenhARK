import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroBoat } from "../src/components/brand/hero-boat";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    const styles = await readFile("src/app/globals.css", "utf8");
    const boat = renderToStaticMarkup(createElement(HeroBoat));
    await page.setContent(`<!doctype html><html class="dark"><head><style>${styles}
      body { margin: 0; width: 1200px; height: 630px; display: grid; place-items: center; background: var(--background); color: var(--foreground); }
      .hero-boat { width: 720px; height: 480px; }
      .text-primary-text { color: var(--primary-text); }
      .hero-boat-sway, .hero-boat-waves { animation: none !important; }
    </style></head><body>${boat}</body></html>`);
    await page.screenshot({
      path: path.resolve("src/app/opengraph-image.png"),
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
