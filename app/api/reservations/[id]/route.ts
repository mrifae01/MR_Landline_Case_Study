import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/reservations/:id
// Cancels a reservation and restores the seat to inventory.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { id },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.status === "CANCELLED") {
    return NextResponse.json({ error: "Reservation is already cancelled" }, { status: 409 });
  }

  // Cancel the reservation and restore the seat in a single transaction
  await prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: { status: "CANCELLED" },
    }),
    prisma.inventory.update({
      where: { tripId: reservation.tripId },
      data: { availableSeats: { increment: reservation.seatCount } },
    }),
  ]);

  return NextResponse.json({ message: "Reservation cancelled successfully" });
}

// PATCH /api/reservations/:id
// Modifies a reservation by switching it to a different trip.
// Cancels the old reservation and creates a new one atomically.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { newTripId } = body;

  if (!newTripId) {
    return NextResponse.json({ error: "newTripId is required" }, { status: 400 });
  }

  const existing = await prisma.reservation.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (existing.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot modify a cancelled reservation" }, { status: 409 });
  }

  if (existing.tripId === newTripId) {
    return NextResponse.json({ error: "Already booked on this trip" }, { status: 409 });
  }

  try {
    const newReservation = await prisma.$transaction(async (tx) => {
      // 1. Cancel the old reservation and restore its seat
      await tx.reservation.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      await tx.inventory.update({
        where: { tripId: existing.tripId },
        data: { availableSeats: { increment: existing.seatCount } },
      });

      // 2. Atomically decrement the new trip's inventory — only if seats remain
      const updated = await tx.inventory.updateMany({
        where: {
          tripId: newTripId,
          availableSeats: { gte: existing.seatCount },
        },
        data: { availableSeats: { decrement: existing.seatCount } },
      });

      if (updated.count === 0) {
        throw new Error("NO_SEATS_AVAILABLE");
      }

      // 3. Look up the new trip's price to store the total cost
      const newSchedule = await tx.schedule.findFirst({ where: { trips: { some: { id: newTripId } } } });
      const totalCost = (newSchedule?.priceCents ?? 0) * existing.seatCount;

      // 4. Create the new confirmed reservation with the same passenger details
      return tx.reservation.create({
        data: {
          tripId: newTripId,
          passengerName: existing.passengerName,
          passengerEmail: existing.passengerEmail,
          passengerPhone: existing.passengerPhone,
          seatCount: existing.seatCount,
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
    });

    return NextResponse.json({
      confirmationId: newReservation.id,
      passengerName: newReservation.passengerName,
      passengerEmail: newReservation.passengerEmail,
      origin: newReservation.trip.schedule.route.origin,
      destination: newReservation.trip.schedule.route.destination,
      departureTime: newReservation.trip.schedule.departureTime,
      arrivalTime: newReservation.trip.schedule.arrivalTime,
      seatCount: newReservation.seatCount,
      priceDisplay: `$${(newReservation.totalCost / 100).toFixed(2)}`,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NO_SEATS_AVAILABLE") {
      return NextResponse.json(
        { error: "No seats available on the requested trip" },
        { status: 409 }
      );
    }

    console.error("Modify error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
