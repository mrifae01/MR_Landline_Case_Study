# Mitchel Rifae's Shuttle Booking System

A production-minded shuttle booking system built for the Landline technical assessment. Users can search for available shuttle trips by route and date, book seats for one or more passengers, manage existing reservations, and receive booking confirmation emails.

**Live Demo:** https://mr-landline-case-study.vercel.app

---

## Running Locally

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/mrifae01/MR_Landline_Case_Study.git
cd MR_Landline_Case_Study

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env

# 4. Start Postgres
docker compose up -d

# 5. Apply database migrations
npx prisma migrate deploy

# 6. Seed dummy data (routes, schedules, and 30 days of trips)
npx tsx prisma/seed.ts

# 7. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

### Environment Variables

Create a `.env` file in the project root:

```env
# Matches the Postgres service in docker-compose.yml
DATABASE_URL="postgresql://landline:landline_password@localhost:5432/landline_dev"
```

> **Note:** Email confirmations are only sent in production (`NODE_ENV=production`) and require Gmail SMTP credentials configured as environment variables. No email setup is needed to run and test the app locally.

### Useful Commands

```bash
npx prisma studio        # Visual database browser at localhost:5555
docker compose down      # Stop the database
docker compose up -d     # Start the database again
npx tsx prisma/seed.ts   # Re-seed routes, schedules, and trips
```

---

## Architecture Overview

### 1. Database Schema

The schema is built around five core entities: **Routes**, **Schedules**, **Trips**, **Inventory**, and **Reservations**.

```
Route ──< Schedule ──< Trip ──── Inventory
                         └──< Reservation
```

**`Route`** is a static origin/destination pair (e.g. Fort Collins to Denver International Airport). Routes serve as the foundation everything else builds on and are enforced unique on `(origin, destination)`.

**`Schedule`** is a recurring timetable entry attached to a route, storing departure/arrival time, days of the week the service runs, and price in cents. Think of it as "the 6:30 AM Fort Collins run, every day, $29." Keeping schedules separate from trips means timetable and pricing changes never affect historical reservation data.

**`Trip`** is a concrete instance of a schedule on a specific calendar date and is the actual thing a passenger books. Trips are pre-generated from their parent schedule for a 30-day rolling window, which keeps availability queries fast with no on-the-fly date math at query time.

**`Inventory`** is a 1:1 record per trip tracking `totalSeats` and `availableSeats`. It is decremented atomically when a seat is held and incremented on cancellation or hold expiry. Storing availability as a dedicated number on its own row (rather than computing it as a count of reservations) means availability reads are a single row lookup regardless of how many reservations exist.

**`Reservation`** is a passenger's booking against a trip, storing name, email, phone, seat count, total cost in cents locked at booking time, and a `status` of `HELD`, `CONFIRMED`, or `CANCELLED`.

- **`HELD`:** Seat is temporarily reserved while the passenger fills in their details. Holds expire after 5 minutes and are cleaned up on the next availability query, restoring seats to inventory.
- **`CONFIRMED`:** Booking is complete and a confirmation email has been sent.
- **`CANCELLED`:** Booking was cancelled and seats were restored to inventory in the same transaction.

Monetary values are stored as `INT` (cents) to avoid floating-point rounding errors. `totalCost` is computed at booking time as `priceCents x seatCount` and stored directly on the reservation record.

When a booking is modified (changing to a different trip), the old reservation is cancelled and a new one is created in a single atomic transaction. If the new trip turns out to be full, the entire operation rolls back and the original booking is preserved.

---

### 2. API Structure

The API follows REST conventions using Next.js App Router route handlers:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/routes` | Returns all origins and available destinations for the search dropdowns |
| `GET` | `/api/trips?origin=X&destination=Y&date=Z&seatCount=N` | Returns trips for a route and date sorted chronologically. Runs expired hold cleanup before querying so seat counts are always accurate. |
| `GET` | `/api/reservations?id=X` or `?email=X` | Looks up confirmed reservations by confirmation ID or passenger email |
| `POST` | `/api/reservations` | Creates a `HELD` reservation for `{ tripId, seatCount }`, atomically decrements inventory, and returns `{ holdId, expiresAt }` |
| `PATCH` | `/api/reservations/:id` | Handles two actions: `{ action: "confirm", passengerName, passengerEmail, passengerPhone }` confirms a hold and sends a confirmation email in production. `{ newTripId }` moves a confirmed booking to a different trip atomically. |
| `DELETE` | `/api/reservations/:id` | Cancels a reservation (held or confirmed) and restores seats to inventory |

**Booking flow:**
1. User searches by origin, destination, and date → `GET /api/trips`
2. User clicks "Select" → `POST /api/reservations` holds the seat immediately, decrements inventory, and starts a 5-minute countdown
3. User fills in passenger details and submits → `PATCH /api/reservations/:id` with `action: "confirm"` completes the booking and sends a confirmation email

Securing the seat at step 2 rather than step 3 means two users can never simultaneously hold the same seat. If the user closes the tab, the seat is released automatically once the hold expires.

---

### 3. Concurrency

Double-booking is prevented at two levels:

**Level 1: Atomic conditional update at hold creation**

When a user clicks "Select", a `HELD` reservation is created inside a Postgres transaction using a conditional `UPDATE`:

```ts
// Inside prisma.$transaction():

// Decrement ONLY if enough seats remain.
// The WHERE condition and the decrement execute as a single SQL statement
// so two concurrent requests cannot both read "3 seats available" and both succeed.
const updated = await tx.inventory.updateMany({
  where: { tripId, availableSeats: { gte: seatCount } },
  data: { availableSeats: { decrement: seatCount } },
});

// If nothing was updated, the seats were already taken by another request.
if (updated.count === 0) throw new Error("NO_SEATS_AVAILABLE");

// Seat is secured. Create the hold.
await tx.reservation.create({ ...data, status: "HELD", expiresAt: now + 5min });
```

If two users race to claim the last seat, only one `UPDATE` will satisfy the `WHERE availableSeats >= seatCount` condition. The other gets `count === 0` and a `409 Conflict` response. The frontend sends them back to the search page with a clear message.

**Level 2: Hold expiry cleanup**

Every call to `GET /api/trips` checks for expired `HELD` reservations across all trips and restores their seats in a transaction before returning results. A user who abandons checkout never permanently blocks a seat. It is released automatically the next time someone searches, at most 5 minutes later.

---

### 4. Production Readiness

**Branch strategy and development lifecycle:**
In an ideal production environment, work would flow through three branches: `dev` for active development auto-deployed to a development environment, `stage` for release candidates that mirror production infrastructure for QA, and `master` for production. Feature branches are cut from `dev`, reviewed via pull request, and merged through the pipeline. Nothing reaches production without passing staging first, so every change gets tested in a production-like environment before it affects real users.

**Zero-downtime deployments:**
Database migrations are committed to version control and applied with `prisma migrate deploy` at deploy time, never `migrate dev` in production. Destructive schema changes like dropping or renaming columns are split across two deploys: first update the application to tolerate both the old and new schema, then clean up the old structure in a follow-up deploy. This allows rolling updates without taking the service offline.

**Observability:**
All booking errors are caught and logged with full context via `console.error`. In production these would be forwarded to an error aggregator like Sentry and logs shipped to a queryable store like Datadog or Logtail. Key metrics worth tracking in a real deployment are hold-to-confirm conversion rate, `409` conflict rate (a signal of high contention on popular trips), and hold expiry rate (a signal that users are abandoning the checkout form).

**Connection management:**
The Prisma client is instantiated as a singleton stored on `globalThis`, which prevents connection pool exhaustion during hot reloads in development and across serverless function invocations in production. The `@prisma/adapter-pg` adapter manages the connection lifecycle without leaking connections.

**Failure handling:**
All state-mutating operations (booking, cancellation, modification) wrap every required database step in a single Postgres transaction. For example, cancelling a booking requires both marking the reservation as `CANCELLED` and restoring the seat to inventory. If either step fails, both are rolled back automatically. There is no halfway state where a seat disappears from inventory without a corresponding confirmed reservation.

**Evolving the system:**
The schema is designed to grow additively. New columns, tables, and relationships can be introduced without modifying or migrating existing data. Adding promotional codes, for example, would mean a new `PromoCode` table and an optional `promoCodeId` foreign key on `Reservation`, leaving all existing reservations untouched. The main operational consideration as the system scales is trip pre-generation. Trips are currently seeded 30 days in advance via a manual script, which would need to become an automated scheduled job in production.

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 16 (App Router) | Full-stack in one repo with API routes and React frontend co-located |
| Language | TypeScript | Type safety across API and UI boundaries |
| Database | PostgreSQL 16 | ACID transactions required for the concurrency guarantees above |
| ORM | Prisma 7 | Type-safe queries, migration tracking, and connection management |
| Styling | Tailwind CSS | Fast UI iteration without switching to separate stylesheets |
| Email | Nodemailer + Gmail SMTP | No extra infrastructure needed, works with any Gmail account via App Password |
| Containerization | Docker + docker-compose | Single command local setup with no external dependencies |
| Deployment | Vercel (app) + Railway (Postgres) | Both offer free tiers and Vercel has first-class Next.js support |

---

## AI Tools Used

This project was built with assistance from **Claude Code** (Anthropic).

Claude was used throughout the development process:

- **Architecture design:** Talking through schema decisions like why to separate `Schedule` from `Trip`, why to use a conditional `UPDATE` instead of a SELECT then UPDATE lock, and how to structure the API before writing any code
- **Scaffolding:** Setting up Next.js, Docker Compose, the Prisma schema, and the overall project structure
- **Code generation:** Writing API route handlers, React components, the seed script, email templates, and the seat hold countdown timer flow
- **Iteration:** Refining the seat hold flow, the `409` conflict UX, double-click protection on the Select button, and stale seat count refresh when navigating back from the booking form

All generated code was reviewed, tested, and adjusted before committing. The architectural decisions reflect deliberate choices made throughout the process, not just what the AI suggested by default.
