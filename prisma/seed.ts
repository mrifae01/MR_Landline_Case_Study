import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { addDays, format, getDay } from "date-fns";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Route & Schedule Definitions ────────────────────────────────────────────
//
// Based on real Landline service corridors.
// Prices are in cents to avoid floating-point issues ($29.00 = 2900).
// daysOfWeek: 0 = Sunday, 1 = Monday … 6 = Saturday

const routeData = [
  {
    origin: "Fort Collins - CSU Transit Center",
    destination: "Denver International Airport",
    schedules: [
      { departureTime: "4:00 AM", arrivalTime: "6:00 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "6:30 AM", arrivalTime: "8:30 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "9:00 AM", arrivalTime: "11:00 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "12:00 PM", arrivalTime: "2:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "3:00 PM", arrivalTime: "5:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "6:00 PM", arrivalTime: "8:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "9:00 PM", arrivalTime: "11:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
    ],
  },
  {
    origin: "Denver International Airport",
    destination: "Fort Collins - CSU Transit Center",
    schedules: [
      { departureTime: "5:00 AM", arrivalTime: "7:00 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "8:00 AM", arrivalTime: "10:00 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "11:00 AM", arrivalTime: "1:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "2:00 PM", arrivalTime: "4:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "5:00 PM", arrivalTime: "7:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "8:00 PM", arrivalTime: "10:00 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
    ],
  },
  {
    origin: "Fort Collins - Harmony Transfer Center (HTC)",
    destination: "Denver International Airport",
    schedules: [
      { departureTime: "5:00 AM", arrivalTime: "6:45 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "8:00 AM", arrivalTime: "9:45 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "12:00 PM", arrivalTime: "1:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "4:00 PM", arrivalTime: "5:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "7:00 PM", arrivalTime: "8:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
    ],
  },
  {
    origin: "Denver International Airport",
    destination: "Fort Collins - Harmony Transfer Center (HTC)",
    schedules: [
      { departureTime: "6:00 AM", arrivalTime: "7:45 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "10:00 AM", arrivalTime: "11:45 AM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "2:00 PM", arrivalTime: "3:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "6:00 PM", arrivalTime: "7:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
      { departureTime: "9:00 PM", arrivalTime: "10:45 PM", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], priceCents: 2900 },
    ],
  },
  {
    origin: "Northern Colorado Regional Airport - FREE Parking (FNL)",
    destination: "Denver International Airport",
    schedules: [
      { departureTime: "6:00 AM", arrivalTime: "7:45 AM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "9:00 AM", arrivalTime: "10:45 AM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "1:00 PM", arrivalTime: "2:45 PM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "5:00 PM", arrivalTime: "6:45 PM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "9:00 AM", arrivalTime: "10:45 AM", daysOfWeek: [0, 6], priceCents: 2900 },
      { departureTime: "3:00 PM", arrivalTime: "4:45 PM", daysOfWeek: [0, 6], priceCents: 2900 },
    ],
  },
  {
    origin: "Denver International Airport",
    destination: "Northern Colorado Regional Airport - FREE Parking (FNL)",
    schedules: [
      { departureTime: "5:00 AM", arrivalTime: "6:45 AM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "8:00 AM", arrivalTime: "9:45 AM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "12:00 PM", arrivalTime: "1:45 PM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "4:00 PM", arrivalTime: "5:45 PM", daysOfWeek: [1, 2, 3, 4, 5], priceCents: 2900 },
      { departureTime: "8:00 AM", arrivalTime: "9:45 AM", daysOfWeek: [0, 6], priceCents: 2900 },
      { departureTime: "2:00 PM", arrivalTime: "3:45 PM", daysOfWeek: [0, 6], priceCents: 2900 },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEATS_PER_SHUTTLE = 20;
const DAYS_TO_SEED = 30;

function parseDateOnly(date: Date): Date {
  return new Date(format(date, "yyyy-MM-dd") + "T00:00:00.000Z");
}

// ─── Main Seed Function ───────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...");

  // Clear existing data in dependency order (reservations first, then up the chain)
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.route.deleteMany();

  let tripCount = 0;

  for (const routeDef of routeData) {
    // 1. Create the route
    const route = await prisma.route.create({
      data: {
        origin: routeDef.origin,
        destination: routeDef.destination,
      },
    });

    for (const scheduleDef of routeDef.schedules) {
      // 2. Create the schedule
      const schedule = await prisma.schedule.create({
        data: {
          routeId: route.id,
          departureTime: scheduleDef.departureTime,
          arrivalTime: scheduleDef.arrivalTime,
          daysOfWeek: scheduleDef.daysOfWeek,
          priceCents: scheduleDef.priceCents,
        },
      });

      // 3. Generate a trip for each day in the next 30 days that this schedule runs
      const today = new Date();

      for (let i = 0; i < DAYS_TO_SEED; i++) {
        const date = addDays(today, i);
        const dayOfWeek = getDay(date);

        if (!scheduleDef.daysOfWeek.includes(dayOfWeek)) continue;

        // 4. Create the trip
        const trip = await prisma.trip.create({
          data: {
            scheduleId: schedule.id,
            departureDate: parseDateOnly(date),
            status: "SCHEDULED",
          },
        });

        // 5. Create inventory for the trip
        await prisma.inventory.create({
          data: {
            tripId: trip.id,
            totalSeats: SEATS_PER_SHUTTLE,
            availableSeats: SEATS_PER_SHUTTLE,
          },
        });

        tripCount++;
      }
    }

    console.log(`  ✓ ${route.origin} → ${route.destination}`);
  }

  console.log(`\nDone. Created ${routeData.length} routes and ${tripCount} trips.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
