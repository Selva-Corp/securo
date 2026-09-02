# This fork

A personal fork of [securo-finance/securo](https://github.com/securo-finance/securo)
that adds Rocket Money-style features (subscription discovery, alerts via ntfy,
a mobile-first home screen) and is deployed to a home NAS. Everything here is
about keeping that fork cheap to carry on top of an active upstream.

## Branches

| Branch   | Role                                                                 |
|----------|----------------------------------------------------------------------|
| `main`   | Pure mirror of `upstream/main`. Fast-forward only, never commit here. |
| `selva`  | Integration branch. What the NAS runs. Every push builds images.      |
| `feat/*` | Feature branches, merged into `selva` via PR.                          |

Remotes: `upstream` = securo-finance/securo, `origin` = this fork.

Sync with upstream:

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout selva && git merge upstream/main   # merge, never rebase (see below)
python3 backend/scripts/check_migration_chain.py
```

Never rebase `selva`: migrations already applied on the NAS must keep their ids.

## Fork-touch budget

New behaviour lives in new files. Upstream files we edit, and nothing else:
`backend/app/services/module_service.py` (catalog entries), `frontend/src/lib/modules.ts`,
`frontend/src/lib/nav-items.ts`, `frontend/src/App.tsx`, `backend/app/main.py` (router
registration), `backend/app/worker.py` (beat schedule/include), two hook lines in
`backend/app/services/connection_service.py`, one in `backend/app/api/import_transactions.py`,
`frontend/src/components/app-layout.tsx`, `frontend/index.html`, the biweekly frequency in two
recurring service functions, and the two module-list tests. If a change needs more than that,
stop and think about an extension seam instead.

## Migrations

Fork migrations use non-numeric revision ids so they can never collide with upstream by
name: files are still numbered for ordering (`077_selva_subscriptions.py`) but carry
`revision = "selva_001"`, `revision = "selva_002"`, and so on. The first one has
`down_revision = "076"` (upstream's head at fork time).

When upstream later adds its own `077` (also `down_revision = "076"`), the chain forks and
`check_migration_chain.py` fails after the merge. Fix it by re-parenting the **incoming
upstream** migration onto the fork's current head:

```python
# in the upstream file, e.g. 077_something.py
down_revision = "selva_002"   # was "076"
```

Re-parent upstream's file, not ours: the NAS database already has `selva_00N` stamped in
`alembic_version`, so our chain must stay exactly as deployed. One line per merge.

Constraints inherited from upstream tests: the suite runs on SQLite, so new models use
`sa.JSON` (not JSONB) and no partial indexes.

## Images and rollout

`.github/workflows/fork-images.yml` builds `ghcr.io/<owner>/securo-backend` and
`securo-frontend` (amd64, tags `latest` + short sha) on every push to `selva`. The
packages must be **public** on GHCR (Packages → package settings → Change visibility),
otherwise the NAS needs a `docker login ghcr.io`. GHCR lowercases the owner name; use
the lowercase form in compose.

The NAS bundle lives in the git-excluded `nas-deploy/` directory. Roll out with
`nas-deploy/scripts/nas-rollout.sh` (pull + up -d + logs). Copy files to the NAS with
`scp -O` — its SSH server has no SFTP subsystem, so plain `scp` fails silently.

Keep `nas-deploy/docker-compose.override.yml`: the NAS volume is btrfs with UGREEN ACLs,
and a bind-mounted file that shows `777` on the host appears as `770` inside the container.
The frontend image runs nginx as uid 101, so it needs `group_add: ["10"]` to read the
mounted nginx template. Any future bind mount into a non-root container needs the same.

## Local development

Docker Desktop is not installed on the Mac. Run the backend and frontend natively:

```bash
cd backend && uv sync --all-extras && uv run pytest -n auto --dist loadfile -q
cd backend && uv run ruff check . && uv run ty check . && python3 scripts/check_migration_chain.py
cd frontend && npm ci && npm run lint && npm run build && npm test
```

Every new UI string must be added to **all 11** files in `frontend/src/locales/`; the
locale test fails on a missing key (English placeholder text is acceptable).
