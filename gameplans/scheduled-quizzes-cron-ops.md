# Scheduled Quizzes Cron — Operations

## Vercel Deployment

The cron job is configured in `vercel.json` and runs daily at 06:00 UTC via `POST /api/cron/scheduled-quizzes`.

### Required Environment Variables

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret token for authorizing cron requests. Set in Vercel project settings under Environment Variables. |
| `DATABASE_URL` | PostgreSQL connection string (already required by the app). |

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCHEDULED_QUIZ_CRON_ENABLED` | enabled | Set to `false` to skip quiz creation without removing the cron schedule (useful for staging). |

## Local Development

Start a local database first — see [local-dev-ephemeral-db.md](./local-dev-ephemeral-db.md).

Then trigger the cron manually with `curl`:

```bash
CRON_SECRET=local-secret curl -X POST http://localhost:3000/api/cron/scheduled-quizzes \
  -H "Authorization: Bearer local-secret"
```

Expected response:

```json
{ "processedUsers": 1, "quizzesCreated": 1, "skipped": 0 }
```

## Response Format

```json
{ "processedUsers": 3, "quizzesCreated": 2, "skipped": 1 }
```

- `processedUsers`: Total `app_user` rows iterated.
- `quizzesCreated`: Users for whom a new scheduled quiz was inserted today.
- `skipped`: Users with no due facts, or whose scheduled quiz for today already exists (idempotent).

## Security

The route validates `Authorization: Bearer <CRON_SECRET>` before touching the database. Vercel automatically injects this header when invoking cron jobs if `CRON_SECRET` is set in project settings.

Per-user DB work runs inside a transaction with `SET LOCAL ROLE recall_app` and `set_config('app.user_id', ...)` — no superuser / BYPASSRLS access is used.
