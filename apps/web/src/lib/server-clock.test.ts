import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerClock } from "./server-clock";

test("server clock applies the offset from serverNow", () => {
  const realNow = Date.now;
  try {
    Date.now = () => 1_000;
    const clock = createServerClock();
    clock.sync(61_000); // server 60 s ahead
    Date.now = () => 2_000;
    assert.equal(clock.now(), 62_000);
  } finally {
    Date.now = realNow;
  }
});
