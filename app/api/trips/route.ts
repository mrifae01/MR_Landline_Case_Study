import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/trips?origin=X&destination=Y&date=YYYY-MM-DD
// Returns all available trips for a given route and date.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const date = searchParams.get("date");
  const seatCount = Math.min(9, Math.max(1, Number(searchParams.get("seatCount") ?? "1")));

  // All three parameters are required — return a clear error if any are missing
  if (!origin || !destination || !date) {
    return NextResponse.json(
      { error: "origin, destination, and date are required" },
      { status: 400 }
    );
  }

  // Parse the date string into a Date object.
  // We store departureDate as a date-only value (no time), so we match on
  // midnight UTC of the requested date.
  const departureDate = new Date(`${date}T00:00:00.000Z`);
  if (isNaN(departureDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  // Find all scheduled trips on that date for the requested route.
  // We join through schedule → route to filter by origin and destination.
  // We also pull in inventory so we can show available seats.
  const trips = await prisma.trip.findMany({
    where: {
      departureDate,
      status: "SCHEDULED",
      schedule: {
        route: { origin, destination },
      },
      // Include sold out trips — the frontend handles display states
      inventory: {
        is: { totalSeats: { gt: 0 } },
      },
    },
    include: {
      schedule: {
        include: {
          route: true,
        },
      },
      inventory: true,
    },
  });



  // Parse "4:00 AM" / "12:30 PM" into minutes since midnight for correct sorting
  function toMinutes(time: string): number {
    const [rawTime, period] = time.split(" ");
    const [h, m] = rawTime.split(":").map(Number);
    return ((h % 12) + (period === "PM" ? 12 : 0)) * 60 + m;
  }

  // Shape the response — only send what the frontend needs
  const results = trips.map((trip) => ({
    id: trip.id,
    origin: trip.schedule.route.origin,
    destination: trip.schedule.route.destination,
    departureDate: date,
    departureTime: trip.schedule.departureTime,
    arrivalTime: trip.schedule.arrivalTime,
    priceCents: trip.schedule.priceCents,
    priceDisplay: `$${(trip.schedule.priceCents / 100).toFixed(2)}`,
    availableSeats: trip.inventory!.availableSeats,
    totalSeats: trip.inventory!.totalSeats,
  }));

  // Sort chronologically, then put sold-out trips at the bottom
  results.sort((a, b) => {
    if (a.availableSeats === 0 && b.availableSeats > 0) return 1;
    if (a.availableSeats > 0 && b.availableSeats === 0) return -1;
    return toMinutes(a.departureTime) - toMinutes(b.departureTime);
  });

  return NextResponse.json({ trips: results });
}
