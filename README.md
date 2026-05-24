# Allo Inventory — Take-Home Exercise

## Live URL
https://allo-inventory-v2.vercel.app

## GitHub Repository
https://github.com/10thejaswini-rgb/allo-inventory-v2

---

## How to run locally

### Prerequisites
- Node.js 18+
- A Neon (Postgres) account
- An Upstash (Redis) account

### Setup

1. Clone the repo:
```bash
git clone https://github.com/10thejaswini-rgb/allo-inventory-v2.git
cd allo-inventory-v2
npm install
```

2. Create a `.env` file: DATABASE_URL="your-neon-connection-string"
REDIS_URL="your-upstash-redis-url"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="any-random-string"

3. Run migrations and seed:
```bash
npx prisma db push
npm run db:seed
```

4. Start the app:
```bash
npm run dev
```

Open http://localhost:3000

---

## How the expiry mechanism works

Reservations expire after 10 minutes. Two mechanisms handle this:

**Lazy cleanup on read**: When `GET /api/reservations/:id` is called, if the reservation is past `expiresAt` and still PENDING, it is immediately released and stock is restored. This ensures stock numbers are always correct at read time.

**Cron job**: A cron endpoint at `/api/cron/expire` bulk-releases all expired reservations. In production this is called periodically.

---

## Concurrency guarantee

The reservation endpoint uses two layers of protection:

1. **Redis distributed lock** — keyed on `stock:{productId}:{warehouseId}`. Only one request holds the lock at a time. Concurrent requests for the same SKU spin-wait up to 3 seconds.

2. **Postgres `SELECT FOR UPDATE`** — inside the lock, inside a Prisma transaction, we lock the StockLevel row. Even if Redis fails, the DB guarantees exactly-once decrement.

---

## Trade-offs and things I'd do differently

- **Single-node Redis lock** — used `SET NX PX` on a single Redis node. For multi-node Redis, Redlock would be needed.
- **No auth** — reservations are anonymous. In production they'd be tied to user sessions.
- **Polling vs WebSockets** — the countdown timer runs client-side from `expiresAt`. A WebSocket channel would handle server-side early releases better.
- **Stock as denormalised counters** — `reservedUnits` is a counter that must be carefully maintained. An alternative is computing available units by summing pending reservations at query time.