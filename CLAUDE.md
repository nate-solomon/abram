# Abram — AI Email Agent

AI agent with its own email address (abram@agentmail.to). Users email it tasks and it handles them using Claude with tool use. Deployed on Railway.

## Architecture

Express server receives inbound emails via AgentMail webhook → runs a Claude agentic loop with tools → replies via AgentMail SDK. Recurring tasks use croner for cron scheduling.

```
Email in → AgentMail webhook → POST /webhook/email → runAgent() → Claude tool loop → sendEmail() reply
                                                                         ↓
                                                              Tools: web search, news, stocks, crypto, scheduling
```

## Project Structure

```
src/
  index.js              # Express server, webhook handler, startup
  agent/claude.js       # Claude agentic loop (tool use cycle until end_turn)
  tools/definitions.js  # Tool schemas passed to Claude
  tools/executor.js     # Tool implementations (web search, news, stocks, crypto, scheduling)
  email/agentmail.js    # AgentMail SDK — send/reply emails, Svix webhook verification
  db/index.js           # Postgres queries via pg pool
  scheduler/index.js    # Cron task management via croner
scripts/
  migrate.js            # DB schema setup (users, threads, messages, scheduled_tasks)
```

## Key Patterns

- **ESM throughout** — `"type": "module"` in package.json, all files use import/export
- **Agentic loop** — `claude.js` calls Claude with tools, executes tool calls, feeds results back, repeats until `stop_reason === "end_turn"`
- **Webhook ack first** — webhook handler sends 200 immediately, then processes async to avoid AgentMail retries
- **Webhook verification** — uses Svix library to verify `svix-id`, `svix-timestamp`, `svix-signature` headers
- **AgentMail payload** — `event_type` (not `type`), `message.from_` is an array of email strings, `message.message_id` for replies

## Adding a New Tool

1. Add schema to `src/tools/definitions.js` (name, description, input_schema)
2. Add `case` to the switch in `src/tools/executor.js`
3. Write the implementation function in `executor.js`
4. Claude will automatically use it based on the schema description

Tools should return plain objects (JSON-serializable). Return `{ error: "..." }` on failure. Prefer free APIs that need no key (Yahoo Finance for stocks, CoinGecko for crypto, DuckDuckGo for search).

## External Services

- **AgentMail** (agentmail.to) — email inbox API. SDK: `AgentMailClient`. Sends via `client.inboxes.messages.send()`, replies via `client.inboxes.messages.reply()`.
- **Claude** — claude-sonnet-4-20250514 with tool use
- **Yahoo Finance** — stock prices (free, no key)
- **CoinGecko** — crypto prices (free, no key)
- **DuckDuckGo** — web search (free, no key)
- **NewsAPI** — news articles (requires NEWS_API_KEY)

## Deployment

- **Railway** — project "abram", auto-deploys from `railway up`
- **Postgres** — Railway plugin, internal hostname `postgres.railway.internal`
- **Public URL** — https://abram-production.up.railway.app
- **Webhook endpoint** — https://abram-production.up.railway.app/webhook/email
- Deploy: `railway up --detach --service 164cf7ea-3f93-45e5-81d0-9162b66abcec`
- Migrate: `railway run --service 164cf7ea-3f93-45e5-81d0-9162b66abcec node scripts/migrate.js` (or use public DB URL locally)
- Logs: `railway logs --service 164cf7ea-3f93-45e5-81d0-9162b66abcec`

## Database Schema

Four tables: `users` (email PK), `threads` (id PK, user_email FK), `messages` (thread_id FK, role, content), `scheduled_tasks` (user_email FK, cron_expression, task_prompt, active boolean). Migration in `scripts/migrate.js`.

## Environment Variables

Required: `ANTHROPIC_API_KEY`, `AGENTMAIL_API_KEY`, `AGENT_EMAIL`, `DATABASE_URL`, `WEBHOOK_SECRET` (Svix whsec_ format)
Optional: `NEWS_API_KEY`, `ALPHA_VANTAGE_KEY`, `PORT` (default 3000)

## Commands

```bash
npm start          # Production
npm run dev        # Dev with --watch
npm run db:migrate # Run database migration
```
