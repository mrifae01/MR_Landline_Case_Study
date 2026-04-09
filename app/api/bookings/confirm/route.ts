import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/email";

// POST /api/bookings/confirm
// Confirms both legs of a round-trip booking in a single atomic transaction.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { outboundHoldId, inboundHoldId, passengerName, passengerEmail, passengerPhone } = body;

  // Validate required fields
  if (!outboundHoldId || !inboundHoldId || !passengerName || !passengerEmail || !passengerPhone) {
    return NextResponse.json(
      { error: "outboundHoldId, inboundHoldId, passengerName, passengerEmail, and passengerPhone are required" },
      { status: 400 }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(passengerEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const digitsOnly = passengerPhone.replace(/\D/g, "");
  const phoneValid = digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith("1"));
  if (!phoneValid) {
    return NextResponse.json(
      { error: "Invalid phone number. Please enter a 10-digit US phone number." },
      { status: 400 }
    );
  }

  try {
    const { outbound: confirmedOutbound, inbound: confirmedInbound } = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Find both reservations
      const outRes = await tx.reservation.findUnique({ where: { id: outboundHoldId } });
      const inRes = await tx.reservation.findUnique({ where: { id: inboundHoldId } });

      if (!outRes || !inRes) {
        throw new Error("RESERVATION_NOT_FOUND");
      }

      if (outRes.status !== "HELD" || inRes.status !== "HELD") {
        throw new Error("RESERVATION_NOT_HELD");
      }

      if (!outRes.expiresAt || outRes.expiresAt <= now || !inRes.expiresAt || inRes.expiresAt <= now) {
        throw new Error("HOLD_EXPIRED");
      }

      // 2. Confirm both reservations
      const outbound = await tx.reservation.update({
        where: { id: outboundHoldId },
        data: {
          status: "CONFIRMED",
          passengerName,
          passengerEmail,
          passengerPhone,
          expiresAt: null,
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

      const inbound = await tx.reservation.update({
        where: { id: inboundHoldId },
        data: {
          status: "CONFIRMED",
          passengerName,
          passengerEmail,
          passengerPhone,
          expiresAt: null,
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

      return { outbound, inbound };
    });

    const outRoute = confirmedOutbound.trip.schedule.route;
    const outSchedule = confirmedOutbound.trip.schedule;
    const inRoute = confirmedInbound.trip.schedule.route;
    const inSchedule = confirmedInbound.trip.schedule;

    const outPriceDisplay = `$${(confirmedOutbound.totalCost / 100).toFixed(2)}`;
    const inPriceDisplay = `$${(confirmedInbound.totalCost / 100).toFixed(2)}`;
    const totalCents = confirmedOutbound.totalCost + confirmedInbound.totalCost;
    const totalPriceDisplay = `$${(totalCents / 100).toFixed(2)}`;

    const bookingGroupId = confirmedOutbound.bookingGroupId ?? confirmedOutbound.id;

    const outboundLeg = {
      confirmationId: confirmedOutbound.id,
      origin: outRoute.origin,
      destination: outRoute.destination,
      departureDate: confirmedOutbound.trip.departureDate.toISOString(),
      departureTime: outSchedule.departureTime,
      arrivalTime: outSchedule.arrivalTime,
      priceDisplay: outPriceDisplay,
      seatCount: confirmedOutbound.seatCount,
    };

    const inboundLeg = {
      confirmationId: confirmedInbound.id,
      origin: inRoute.origin,
      destination: inRoute.destination,
      departureDate: confirmedInbound.trip.departureDate.toISOString(),
      departureTime: inSchedule.departureTime,
      arrivalTime: inSchedule.arrivalTime,
      priceDisplay: inPriceDisplay,
      seatCount: confirmedInbound.seatCount,
    };

    // Send confirmation email in production only
    if (process.env.NODE_ENV === "production") {
      sendBookingConfirmation({
        to: passengerEmail,
        passengerName,
        outbound: outboundLeg,
        inbound: inboundLeg,
        totalPriceDisplay,
      })?.catch((err) => console.error("Email failed:", err));
    }

    return NextResponse.json({
      bookingGroupId,
      outbound: outboundLeg,
      inbound: inboundLeg,
      passengerName,
      passengerEmail,
      totalPriceDisplay,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "RESERVATION_NOT_FOUND") {
        return NextResponse.json({ error: "One or both reservations not found" }, { status: 404 });
      }
      if (error.message === "RESERVATION_NOT_HELD") {
        return NextResponse.json({ error: "One or both reservations are no longer held" }, { status: 409 });
      }
      if (error.message === "HOLD_EXPIRED") {
        return NextResponse.json({ error: "One or both holds have expired. Please start again." }, { status: 409 });
      }
    }
    console.error("Round-trip confirm error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
