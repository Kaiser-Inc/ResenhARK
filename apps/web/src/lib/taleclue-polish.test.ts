import assert from "node:assert/strict";
import { test } from "node:test";
import { TALECLUE_CARDS } from "@resenhark/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaleclueCard } from "../components/taleclue/taleclue-card";
import { TALECLUE_REVEAL_STAGES, taleclueRevealStage, taleclueThumbnail } from "./taleclue";

test("reveal highlights follow the five server steps and finish in twelve seconds", () => {
  assert.deepEqual(
    TALECLUE_REVEAL_STAGES.map((stage) => stage.type),
    ["card-flip", "votes", "award-correct", "award-decoy", "board-move"],
  );
  assert.equal(
    TALECLUE_REVEAL_STAGES.reduce((total, stage) => total + stage.duration, 0),
    12000,
  );
  for (let index = 0; index < 5; index++) {
    assert.equal(taleclueRevealStage(index * 2400).index, index);
    assert.equal(taleclueRevealStage(index * 2400 + 2399).index, index);
  }
  assert.equal(taleclueRevealStage(12000).active, false);
  assert.equal(taleclueRevealStage(15000).index, 4);
  assert.equal(taleclueRevealStage(-1).index, 0);
});
test("a reconnect seeks the current highlight using elapsed server time", () => {
  assert.deepEqual(taleclueRevealStage(6200), { index: 2, type: "award-correct", active: true });
  assert.equal(taleclueRevealStage(10000).type, "board-move");
});
test("card thumbnails are derived once from the manifest path", () => {
  const card = TALECLUE_CARDS[0];
  assert.equal(taleclueThumbnail(card.image), `/taleclue/cards/${card.id}.thumb.webp`);
  assert.equal(taleclueThumbnail("missing.png"), "missing.png");
  const markup = renderToStaticMarkup(createElement(TaleclueCard, { cardId: card.id, index: 0 }));
  assert.ok(markup.includes(`src="${taleclueThumbnail(card.image)}"`));
  assert.ok(markup.includes(card.alt.replaceAll("&", "&amp;").replaceAll('"', "&quot;")));
});
