# Allo Inventory 

**Live demo:** https://allo-inventory-v2.vercel.app  
**GitHub:** https://github.com/10thejaswini-rgb/allo-inventory-v2

---

## What I built

A multi-warehouse inventory reservation system where customers can hold stock for 10 minutes while they complete payment. The core challenge was making sure two customers can never successfully reserve the same last unit — that race condition is what I focused most of my energy on.

The stack: Next.js 14 (App Router) + TypeScript, Prisma + Neon (Postgres), Redis (Upstash), Tailwind CSS, deployed on Vercel.

---

## Running it locally

### 1. Clone and install
```bash
git clone https://github.com/10thejaswini-rgb/allo-inventory-v2.git
cd allo-inventory-v2
npm install
```

### 2. Set up environment variables
Create a `.env` file in the root:
DATABASE_URL="your-neon-postgres-url"
REDIS_URL="your-upstash-redis-url"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
CRON_SECRET="any-random-string"

Both Neon and Upstash have free tiers that work fine here.

### 3. Create tables and seed data
```bash
npx prisma db push
npm run db:seed
```

This creates 6 products across 3 warehouses with realistic stock levels — including some deliberately low-stock items to make the 409 scenario easy to trigger.

### 4. Start the dev server
```bash
npm run dev
```

Open http://localhost:3000. You should see the product listing straight away.

---

## How the concurrency guarantee works

This was the part I thought hardest about.

The race condition is: two requests arrive simultaneously for the last unit. Both read `available = 1`, both decide that's enough, both succeed. One customer gets a refund and a bad experience.

I used two layers of protection:

**Layer 1 — Redis distributed lock** (`src/lib/lock.ts`)  
When a reservation request comes in, it tries to acquire a Redis lock keyed on `stock:{productId}:{warehouseId}` using `SET NX PX` (set-if-not-exists with a 5s expiry). Only one request holds the lock at a time. Concurrent requests spin-wait up to 3 seconds before giving up with a 503.

The lock is scoped per SKU+warehouse deliberately — reservations for different products should never block each other.

**Layer 2 — Postgres `SELECT FOR UPDATE`** (`src/app/api/reservations/route.ts`)  
Inside the lock, inside a Prisma transaction, I lock the StockLevel row at the database level. This is the safety net — if Redis goes down or something bypasses the lock, the database itself prevents the phantom read.

Belt and suspenders. Either layer alone would work in most cases; both together means I'm confident in correctness.

---

## How reservation expiry works

Reservations expire after 10 minutes. I implemented two mechanisms:

**Lazy cleanup on read**  
Whenever `GET /api/reservations/:id` is called, the server checks if the reservation is past `expiresAt`. If it is and it's still PENDING, it releases the stock right there before responding. This means stock counts are always accurate at read time, even if no background job has run.

**Cron endpoint**  
`/api/cron/expire` does a bulk release of all expired reservations. In a full production setup this would run every minute via Vercel Cron. On the free plan it's limited to once daily, so the lazy cleanup carries most of the weight locally.

---

## Data model
Product         — name, price, description, image
Warehouse       — name, location
StockLevel      — productId + warehouseId + totalUnits + reservedUnits
Reservation     — productId, warehouseId, quantity, status, expiresAt
IdempotencyRecord — key, responseBody, statusCode (for retry safety)

`availableUnits = totalUnits - reservedUnits` at any point in time.

When a reservation is confirmed: both `totalUnits` and `reservedUnits` decrease (stock is permanently gone).  
When a reservation is released: only `reservedUnits` decreases (stock returns to available).

---

## Idempotency (bonus)

`POST /api/reservations` and `POST /api/reservations/:id/confirm` accept an `Idempotency-Key` header.

On the first request: the handler runs and the response is saved to the `IdempotencyRecord` table (also cached in Redis for an hour).

On a retry with the same key: the saved response is returned immediately without re-running the handler. This means a network timeout that triggers a retry won't double-book stock.

---

## Trade-offs and honest reflections

**Single-node Redis lock**  
I'm using `SET NX PX` on a single Redis node. This is fine for a single-node deployment (Upstash free tier), but for a Redis cluster you'd want Redlock. I'd note this in a production design review.

**No authentication**  
Reservations are anonymous — any request can confirm or release any reservation by ID. In production, reservations would be tied to authenticated user sessions.

**Client-side countdown timer**  
The timer counts down from `expiresAt` in the browser. If the server releases a reservation early (e.g. admin action), the client wouldn't know until it navigates. Server-Sent Events or a WebSocket would handle this better.

**Denormalised stock counters**  
`reservedUnits` is a counter that every code path touching reservations must carefully maintain. An alternative is computing available units by counting active reservations at query time — always consistent but slower at scale.

**What I'd add with more time**  
User auth, an admin dashboard for restocking, load tests to verify the lock under real concurrency, and WebSocket-based expiry notifications.