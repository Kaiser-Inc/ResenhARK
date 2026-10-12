import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The job names are the contract with branch protection on main: renaming one silently unprotects it.
const workflow = readFileSync(
  path.join(import.meta.dirname, "../../../.github/workflows/ci.yml"),
  "utf8",
);

/** The text of one job, from its key up to the next job. */
function jobBlock(id: string): string {
  const match = workflow.match(
    new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:\\n|(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `job ${id} not found in ci.yml`);
  return match[1];
}

test("the workflow runs on pull requests and pushes to develop and main, and by hand", () => {
  assert.match(
    workflow,
    /^on:\n {2}pull_request:\n {4}branches: \[develop, main\]\n {2}push:\n {4}branches: \[develop, main\]\n {2}workflow_dispatch:\n/m,
  );
});

test("the workflow only reads the repository and cancels superseded runs", () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(workflow, /^ {4}permissions:/m);
  assert.match(
    workflow,
    /^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true\n/m,
  );
});

test("only the three allowed actions are used", () => {
  const uses = [...workflow.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0, "no action found");
  for (const action of uses) {
    assert.match(
      action,
      /^(actions\/checkout|actions\/setup-node|pnpm\/action-setup)@v\d+$/,
      action,
    );
  }
});

test("job ci runs lint, typecheck and the tests against a Redis service", () => {
  const ci = jobBlock("ci");
  assert.match(ci, /^ {4}name: ci$/m);
  assert.match(ci, /^ {4}timeout-minutes: \d+$/m);
  assert.match(ci, /image: redis:7-alpine/);
  assert.match(ci, /--health-cmd "redis-cli ping"/);
  const steps = ["pnpm install --frozen-lockfile", "pnpm lint", "pnpm typecheck", "pnpm test"];
  const at = steps.map((step) => ci.indexOf(`run: ${step}\n`));
  assert.ok(
    at.every((i) => i >= 0),
    `a step is missing: ${at}`,
  );
  assert.deepEqual(
    [...at].sort((a, b) => a - b),
    at,
    "steps are out of order",
  );
});

test("job web-build runs the production build of the web app", () => {
  const job = jobBlock("web-build");
  assert.match(job, /^ {4}name: web-build$/m);
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.match(job, /run: pnpm install --frozen-lockfile\n/);
  assert.match(job, /run: pnpm --filter web build\n/);
});

test("job docker-api builds the image, boots it in production mode and waits for /health", () => {
  const job = jobBlock("docker-api");
  assert.match(job, /^ {4}name: docker-api$/m);
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.match(job, /image: redis:7-alpine/);
  assert.match(job, /--health-cmd "redis-cli ping"/);
  assert.match(job, /docker build -f apps\/api\/Dockerfile /);
  assert.match(job, /-e NODE_ENV=production/);
  assert.match(job, /-e PLAYLIST_SOURCE=fixture/);
  assert.match(job, /\/health/);
  assert.match(job, /exit 1/);
  assert.match(job, /docker logs/);
});

test("the workflow has exactly the three checks that branch protection will require", () => {
  const names = [...workflow.matchAll(/^ {2}([a-z][a-z-]*):\n {4}name: \1$/gm)].map((m) => m[1]);
  assert.deepEqual(names, ["ci", "web-build", "docker-api"]);
});
