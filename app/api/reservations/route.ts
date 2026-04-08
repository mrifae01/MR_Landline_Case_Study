import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reservations?id=X  or  ?email=X
// Looks up reservations by confirmation ID or passenger email.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  const email = searchParams.get("email");

  if (!id && !email) {
    return NextResponse.json(
      { error: "Provide either id or email to look up a booking" },
      { status: 400 }
    );
  }

  const reservations = await prisma.reservation.findMany({
    where: {
      ...(id ? { id } : {}),
      ...(email ? { passengerEmail: email } : {}),
      status: "CONFIRMED",
    },
    include: {
      trip: {
        include: {
          schedule: {
            include: { route: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const results = reservations.map((r) => ({
    id: r.id,
    status: r.status,
    passengerName: r.passengerName,
    passengerEmail: r.passengerEmail,
    passengerPhone: r.passengerPhone,
    origin: r.trip.schedule.route.origin,
    destination: r.trip.schedule.route.destination,
    departureDate: r.trip.departureDate,
    departureTime: r.trip.schedule.departureTime,
    arrivalTime: r.trip.schedule.arrivalTime,
    seatCount: r.seatCount,
    totalCost: r.totalCost,
    priceDisplay: `$${(r.totalCost / 100).toFixed(2)}`,
    tripId: r.trip.id,
  }));

  return NextResponse.json({ reservations: results });
}

// POST /api/reservations
// Creates a HELD reservation for a trip (no passenger details yet).
// Atomically decrements seats — either both happen or neither does.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tripId, seatCount: rawSeatCount } = body;
  const seatCount = Math.min(9, Math.max(1, Number(rawSeatCount ?? 1)));

  if (!tripId) {
    return NextResponse.json(
      { error: "tripId is required" },
      { status: 400 }
    );
  }

  // Verify the trip exists before entering the transaction
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { inventory: true },
  });

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // Atomically decrement availableSeats — but ONLY if enough seats remain.
      const updated = await tx.inventory.updateMany({
        where: {
          tripId,
          availableSeats: { gte: seatCount },
        },
        data: {
          availableSeats: { decrement: seatCount },
        },
      });

      if (updated.count === 0) {
        throw new Error("NO_SEATS_AVAILABLE");
      }

      // Fetch the price so we can store the total cost at time of booking
      const schedule = await tx.schedule.findFirst({ where: { trips: { some: { id: tripId } } } });
      const totalCost = (schedule?.priceCents ?? 0) * seatCount;

      // Create the held reservation with empty passenger fields
      const newReservation = await tx.reservation.create({
        data: {
          tripId,
          passengerName: "",
          passengerEmail: "",
          passengerPhone: "",
          seatCount,
          totalCost,
          status: "HELD",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return newReservation;
    });

    return NextResponse.json(
      {
        holdId: reservation.id,
        expiresAt: reservation.expiresAt,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NO_SEATS_AVAILABLE") {
      return NextResponse.json(
        { error: "No seats available on this trip" },
        { status: 409 }
      );
    }

    console.error("Hold error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
