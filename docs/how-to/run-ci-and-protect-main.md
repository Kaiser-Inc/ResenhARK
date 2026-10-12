# Run the CI checks and protect main

Every pull request, and every push to `develop` or `main`, runs the CI workflow in `.github/workflows/ci.yml`. It has three jobs that run in parallel. This page shows what each one checks, how to reproduce it on your machine, and how to make `main` require all three.

## The three checks

| Check | What it runs |
|---|---|
| `ci` | `pnpm lint`, `pnpm typecheck` and `pnpm test`, with Redis as a service container |
| `web-build` | The production build of the web app, `pnpm --filter web build` |
| `docker-api` | Builds the API image from `apps/api/Dockerfile`, starts it in production mode against Redis, and waits for `/health` to answer `ok` |

A new commit on the same branch or pull request cancels the run in progress. Once `ci.yml` is on `main`, you can also start a run yourself: open the Actions tab, pick **CI** and click **Run workflow**, or run `gh workflow run ci.yml --ref <branch>`. GitHub only offers a manual run for workflow files that exist on the default branch.

The end-to-end tests are not in the CI. They take 20 to 25 minutes and need Playwright, so run them yourself before a release. See [Run the tests](run-tests.md).

## Reproduce a check on your machine

You need the setup from the [tutorial](../tutorial-first-game.md).

**ci**

```sh
make up
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
```

**web-build**

```sh
pnpm --filter web build
```

The build writes to `apps/web/.next`. If a `next dev` is running in the same checkout, stop it first, or run the build in another git worktree.

**docker-api**

```sh
docker build -f apps/api/Dockerfile -t resenhark-api:ci .
docker run -d --name api-ci-check -p 3366:3333 \
  --add-host=host.docker.internal:host-gateway \
  -e NODE_ENV=production \
  -e SESSION_SECRET="$(openssl rand -hex 24)" \
  -e ADMIN_PASSWORD="$(openssl rand -hex 12)" \
  -e CORS_ORIGIN=http://localhost:4000 \
  -e WEB_URL=http://localhost:4000 \
  -e PUBLIC_API_URL=http://127.0.0.1:3366 \
  -e PLAYLIST_SOURCE=fixture \
  -e REDIS_URL=redis://host.docker.internal:6379/5 \
  resenhark-api:ci
curl http://127.0.0.1:3366/health
docker rm -f api-ci-check
```

You should see `{"status":"ok","redis":"ok"}`. The API may need a few seconds to boot, so a first `curl` can fail. The `--add-host` line lets the container reach the Redis on your machine on Linux, and Docker Desktop already resolves that name.

Production mode refuses to start without `SESSION_SECRET` (32 characters or more), `ADMIN_PASSWORD` (12 or more), `CORS_ORIGIN`, `WEB_URL` and `PUBLIC_API_URL`. It also defaults to the Spotify playlist source, which needs `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI`. The command above sets `PLAYLIST_SOURCE=fixture` to skip them. A red `docker-api` usually means the image or the settings changed, and the job prints the container log when it fails.

## Make main require the checks

By default a red check does not stop a merge. A branch protection rule on `main` turns the checks into a gate.

Run the CI once first and wait for all three checks to finish. The API accepts any check name, but GitHub ties each required check to the app that last reported it, so create the rule after GitHub Actions has reported all three.

```sh
gh api -X PUT repos/Kaiser-Inc/ResenhARK/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "checks": [{ "context": "ci" }, { "context": "web-build" }, { "context": "docker-api" }]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

This rule:

- accepts changes to `main` only through a pull request, with no approval required;
- requires `ci`, `web-build` and `docker-api` to pass;
- blocks force pushes and deleting the branch;
- lets repository administrators bypass the rule, so a broken CI cannot stop an emergency fix.

`develop` stays unprotected, so you can still push to it directly.

To remove the rule:

```sh
gh api -X DELETE repos/Kaiser-Inc/ResenhARK/branches/main/protection
```

### The weekly catalog pull request

The workflow that refreshes the Hitline catalog opens its pull request with the default `GITHUB_TOKEN`, and GitHub does not start workflows for pull requests opened that way. With the rule on, that pull request waits for checks that never begin. Pick one way out:

- **Run the CI on it by hand.** Once `ci.yml` is on `main`, run `gh workflow run ci.yml --ref chore/hitline-catalog`. The three checks attach to the head commit of the pull request and count for the rule.
- **Close and reopen the pull request.** A person doing that fires the `pull_request` trigger, so the CI starts on its own.
- **Merge it as an administrator.** The rule lets administrators bypass it, and the CI runs on the push to `main` right after. This merges the catalog before the checks have run.
- **Give the catalog workflow a token** from a GitHub App or a personal access token, so its pull requests start workflows. This takes setup, and the weekly workflow does not do it today.

See [Update the Hitline catalog](update-hitline-catalog.md) for the workflow itself.
