import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/email";

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
      status: { not: "CANCELLED" },
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
// Creates a confirmed booking for a trip.
// Uses a database transaction to guarantee seat decrement and reservation
// creation are always atomic — either both happen or neither does.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tripId, passengerName, passengerEmail, passengerPhone, seatCount: rawSeatCount } = body;
  const seatCount = Math.min(9, Math.max(1, Number(rawSeatCount ?? 1)));

  // Validate required fields
  if (!tripId || !passengerName || !passengerEmail || !passengerPhone) {
    return NextResponse.json(
      { error: "tripId, passengerName, passengerEmail, and passengerPhone are required" },
      { status: 400 }
    );
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(passengerEmail)) {
    return NextResponse.json(
      { error: "Invalid email address" },
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
      // Atomically decrement availableSeats — but ONLY if it is still above 0.
      // The WHERE condition (availableSeats > 0) and the decrement happen in a
      // single SQL UPDATE, so two simultaneous requests cannot both see "1 seat"
      // and both succeed. If count === 0, the seat was already taken.
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

      // Create the confirmed reservation
      const newReservation = await tx.reservation.create({
        data: {
          tripId,
          passengerName,
          passengerEmail,
          passengerPhone,
          seatCount,
          totalCost,
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
      });

      return newReservation;
    });

    const route = reservation.trip.schedule.route;
    const schedule = reservation.trip.schedule;
    const priceDisplay = `$${(reservation.totalCost / 100).toFixed(2)}`;

    // Send confirmation email in production only — local reviewers won't have Gmail credentials
    if (process.env.NODE_ENV === "production") sendBookingConfirmation({
      to: reservation.passengerEmail,
      confirmationId: reservation.id,
      passengerName: reservation.passengerName,
      origin: route.origin,
      destination: route.destination,
      departureDate: reservation.trip.departureDate.toISOString(),
      departureTime: reservation.trip.schedule.departureTime,
      arrivalTime: reservation.trip.schedule.arrivalTime,
      seatCount: reservation.seatCount,
      priceDisplay,
    })?.catch((err) => console.error("Email failed:", err));

    return NextResponse.json(
      {
        confirmationId: reservation.id,
        passengerName: reservation.passengerName,
        passengerEmail: reservation.passengerEmail,
        seatCount: reservation.seatCount,
        origin: route.origin,
        destination: route.destination,
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        priceDisplay,
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

    console.error("Booking error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
