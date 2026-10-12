import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const workflow = readFileSync(
  path.join(import.meta.dirname, "../../../.github/workflows/ci.yml"),
  "utf8",
).replace(/\r\n/g, "\n");

/**
 * What the workflow promises to branch protection and to the people who read it. The job names are the
 * contract with main: renaming a job, or giving it a matrix, silently unprotects the branch.
 */
function violations(text: string): string[] {
  const found: string[] = [];
  const need = (ok: boolean, why: string) => {
    if (!ok) found.push(why);
  };
  need(
    /^on:\n {2}pull_request:\n {4}branches: \[develop, main\]\n {2}push:\n {4}branches: \[develop, main\]\n {2}workflow_dispatch:\n(?! )/m.test(
      text,
    ),
    "triggers",
  );
  need(/^permissions:\n {2}contents: read\n(?! )/m.test(text), "read-only permissions");
  need(!/^ {4}permissions:/m.test(text), "job-level permissions");
  need(
    /^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true\n/m.test(
      text,
    ),
    "concurrency",
  );
  need(
    !/continue-on-error|^\s+(- )?if:|^\s+strategy:/m.test(text),
    "no continue-on-error, if or strategy, which hide a failure or rename a check",
  );
  const uses = [...text.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  need(
    uses.length > 0 &&
      uses.every((a) =>
        /^(actions\/checkout|actions\/setup-node|pnpm\/action-setup)@v\d+$/.test(a),
      ),
    "allowed actions",
  );
  const jobs = text.split(/^jobs:\n/m)[1] ?? "";
  const ids = [...jobs.matchAll(/^ {2}([a-z][a-z-]*):\n/gm)].map((m) => m[1]);
  const named = [...jobs.matchAll(/^ {2}([a-z][a-z-]*):\n {4}name: \1$/gm)].map((m) => m[1]);
  const three = JSON.stringify(["ci", "web-build", "docker-api"]);
  need(
    JSON.stringify(ids) === three && JSON.stringify(named) === three,
    "exactly the three checks",
  );
  return found;
}

/** The text of one job, from its key up to the next job. */
function jobBlock(id: string): string {
  const match = workflow.match(
    new RegExp(`^  ${id}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:\\n|(?![\\s\\S]))`, "m"),
  );
  assert.ok(match, `job ${id} not found in ci.yml`);
  return match[1];
}

function mutate(find: string, replace: string): string {
  assert.ok(workflow.includes(find), `ci.yml no longer contains ${JSON.stringify(find)}`);
  return workflow.replace(find, replace);
}

test("the workflow keeps its contract with branch protection", () => {
  assert.deepEqual(violations(workflow), []);
});

test("the contract rejects the edits that would weaken it", () => {
  const weakened: Record<string, string> = {
    "a write permission": mutate(
      "  contents: read\n",
      "  contents: read\n  pull-requests: write\n",
    ),
    "another trigger": mutate(
      "  workflow_dispatch:\n",
      "  workflow_dispatch:\n  pull_request_target:\n    branches: [main]\n",
    ),
    "a failure hidden by continue-on-error": mutate(
      "      - run: pnpm test\n",
      "      - run: pnpm test\n        continue-on-error: true\n",
    ),
    "a step that never runs": mutate(
      "      - run: pnpm lint\n",
      "      - if: false\n        run: pnpm lint\n",
    ),
    "a matrix that renames the check": mutate(
      "    runs-on: ubuntu-latest\n",
      "    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [22]\n",
    ),
    "a fourth job": `${workflow}\n  extra:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`,
    "an action outside the list": mutate(
      "      - run: pnpm --filter web build\n",
      "      - uses: docker/setup-buildx-action@v3\n      - run: pnpm --filter web build\n",
    ),
  };
  for (const [what, text] of Object.entries(weakened)) {
    assert.notDeepEqual(violations(text), [], `the contract accepts ${what}`);
  }
});

test("job ci runs lint, typecheck and the tests against a Redis service", () => {
  const ci = jobBlock("ci");
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
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.match(job, /run: pnpm install --frozen-lockfile\n/);
  assert.match(job, /run: pnpm --filter web build\n/);
});

test("job docker-api builds the image, boots it in production mode and waits for /health", () => {
  const job = jobBlock("docker-api");
  assert.match(job, /^ {4}timeout-minutes: \d+$/m);
  assert.match(job, /image: redis:7-alpine/);
  assert.match(job, /--health-cmd "redis-cli ping"/);
  assert.match(job, /docker build -f apps\/api\/Dockerfile /);
  assert.match(job, /-e NODE_ENV=production/);
  assert.match(job, /-e PLAYLIST_SOURCE=fixture/);
  assert.match(job, /\/health/);
  assert.match(job, /exit 1/);
  assert.match(job, /docker logs/);
  // A health call that hangs would end the job on its timeout, before the log is printed.
  assert.match(job, /curl -fsS --max-time \d+ /);
});
