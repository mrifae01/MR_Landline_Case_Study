# Mitchel Rifae's Shuttle Booking

A production-minded shuttle booking system built for the Landline technical assessment. Users can search for available shuttle trips by route and date, book seats for one or more passengers, manage existing reservations, and receive confirmation emails.

**Live Demo:** _link goes here after deployment_

---

## Running Locally

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd Landline_Case_Study

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Fill in RESEND_API_KEY with your key from resend.com

# 4. Start Postgres
docker compose up -d

# 5. Apply database migrations
npx prisma migrate dev

# 6. Generate the Prisma client
npx prisma generate

# 7. Seed dummy data (routes, schedules, 30 days of trips)
npx prisma db seed

# 8. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

### Useful commands

```bash
npx prisma studio        # Visual database browser at localhost:5555
docker compose down      # Stop the database
docker compose up -d     # Start the database again
```

---

## Architecture Overview

### 1. Database Schema

The schema is organized around five core entities: **Routes**, **Schedules**, **Trips**, **Inventory**, and **Reservations**.

- **`routes`** — Static origin/destination pairs (e.g. Fort Collins → Denver International Airport). These rarely change and serve as the foundation everything else builds on.
- **`schedules`** — Recurring timetable entries attached to a route: departure/arrival time, days of week, and price in cents. A schedule represents "the 6:30 AM Fort Collins run, 7 days a week, $29."
- **`trips`** — Concrete instances of a schedule on a specific calendar date. A trip is what a passenger actually books. Trips are pre-generated 30 days in advance from their parent schedule.
- **`inventory`** — A 1:1 record per trip tracking `totalSeats` and `availableSeats`. Decremented atomically on booking, incremented on cancellation.
- **`reservations`** — A passenger's booking against a trip, storing name, email, phone, seat count, total cost (in cents, locked at time of booking), and a `status` of `CONFIRMED` or `CANCELLED`.

**Cancellations** increment `availableSeats` back on the inventory row in the same transaction, so inventory is never left in an inconsistent state.

**Modifications** (changing trip or date) cancel the old reservation and create a new one atomically in a single transaction — the old seat is restored and the new one is claimed together.

**Monetary values** are stored as `INT` (cents) to avoid floating-point rounding errors. The `totalCost` column is computed at booking time (`priceCents × seatCount`) and stored on the reservation — so the price a passenger paid is always preserved even if schedules change later.

---

### 2. API Structure

The API follows a simple REST structure built with Next.js API routes:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/routes` | List all origins and destinations for search dropdowns |
| `GET` | `/api/trips?origin=X&destination=Y&date=Z&seatCount=N` | Return all trips for a route and date, sorted chronologically. Includes sold-out trips so the UI can display their status. |
| `GET` | `/api/reservations?id=X` or `?email=X` | Look up active reservations by confirmation ID or email |
| `POST` | `/api/reservations` | Create a confirmed booking. Atomically decrements inventory and stores the reservation in a single transaction. |
| `PATCH` | `/api/reservations/:id` | Modify a booking by switching to a different trip. Cancels the old reservation and creates a new one atomically. |
| `DELETE` | `/api/reservations/:id` | Cancel a booking and restore seats to inventory. |

---

### 3. Concurrency

Double-booking is prevented with an atomic conditional update inside a Postgres transaction:

```ts
// Inside prisma.$transaction():

// Step 1 — Decrement ONLY if enough seats remain.
// The WHERE condition and the decrement happen in a single SQL statement,
// so two concurrent requests cannot both see "seats available" and both succeed.
const updated = await tx.inventory.updateMany({
  where: { tripId, availableSeats: { gte: seatCount } },
  data: { availableSeats: { decrement: seatCount } },
});

// Step 2 — If nothing was updated, seats were already taken.
if (updated.count === 0) throw new Error("NO_SEATS_AVAILABLE");

// Step 3 — Create the reservation now that the seat is secured.
await tx.reservation.create({ ... });
```

The `WHERE availableSeats >= seatCount` condition acts as an optimistic lock — if two requests race, only one will satisfy the condition and decrement. The other gets `count === 0` and receives a `409 Conflict` response. The entire operation is wrapped in a transaction so partial states are impossible.

---

### 4. Production Readiness

**Deployments without disruption:** Database migrations are additive and committed to version control. Destructive changes (dropping columns, renaming) are split across two deploys — first make the app tolerant of both old and new schema, then clean up. This enables zero-downtime rolling updates.

**Observability:** Next.js surfaces structured request logs out of the box. All booking errors are caught and logged with full context via `console.error`. A `/api/health` endpoint can be added as a liveness probe for container orchestration. In a full production setup, unhandled errors would be forwarded to Sentry and logs shipped to a queryable aggregator.

**Failure handling:** The Prisma client is instantiated as a singleton (stored on `globalThis`) so hot-reloads in development never exhaust the connection pool. The adapter pattern (`@prisma/adapter-pg`) manages connection lifecycle. All state-mutating operations use transactions — if any step fails, Postgres rolls back the entire operation automatically.

**Evolving the system:** The `schedules` → `trips` separation is intentional. New routes and schedule changes do not require touching existing reservation data. The seed script regenerates trips on demand. Additional features like pricing tiers, promotional codes, or multi-leg trips can be added by extending the schema additively without breaking existing queries.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL 16 (Docker) |
| ORM | Prisma 7 |
| Styling | Tailwind CSS |
| Email | Resend |
| Deployment | Vercel + Railway |

---

## AI Tools Used

This project was built with significant assistance from **Claude Code** (Anthropic).

Claude was used throughout the entire development process:
- **Architecture design** — Talking through schema decisions, concurrency tradeoffs, and API structure before writing any code
- **Scaffolding** — Setting up Next.js, Docker Compose, Prisma, and the project structure
- **Code generation** — Writing API routes, React components, the seed script, and email templates
- **Debugging** — Resolving Prisma v7 compatibility issues, migration errors, and runtime bugs
- **Iteration** — Refining features like the passenger count, sold-out states, modify booking flow, and dynamic pricing

All generated code was reviewed, tested, and in several cases manually adjusted before being committed.
