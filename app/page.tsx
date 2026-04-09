"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trip {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  priceCents: number;
  priceDisplay: string;
  availableSeats: number;
  totalSeats: number;
}

interface BookingConfirmation {
  bookingGroupId?: string;
  passengerName: string;
  passengerEmail: string;
  tripType: "one-way" | "round-trip";
  outbound: {
    confirmationId: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    priceDisplay: string;
    seatCount: number;
  };
  inbound?: {
    confirmationId: string;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
    priceDisplay: string;
    seatCount: number;
  };
  totalPriceDisplay: string;
}

type BookStep = "search" | "results" | "return-results" | "booking" | "confirmation";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  // ── Book flow state ────────────────────────────────────────────────────────
  const [bookStep, setBookStep] = useState<BookStep>("search");
  const [origins, setOrigins] = useState<string[]>([]);
  const [allRoutes, setAllRoutes] = useState<{ origin: string; destination: string }[]>([]);
  const [regions, setRegions] = useState<Record<string, string[]>>({});
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [seatCount, setSeatCount] = useState(1);
  const [tripType, setTripType] = useState<"one-way" | "round-trip">("one-way");
  const [returnDate, setReturnDate] = useState("");

  // If origin is selected, filter destinations to valid routes from that origin.
  // Otherwise show all destinations so the user can pick destination first.
  const destinations = origin
    ? allRoutes.filter((r) => r.origin === origin).map((r) => r.destination)
    : [...new Set(allRoutes.map((r) => r.destination))].sort();

  // If destination is selected, filter origins to only those with a route to it.
  // Otherwise show all origins.
  const filteredOrigins = destination
    ? allRoutes.filter((r) => r.destination === destination).map((r) => r.origin)
    : origins;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [outboundTrip, setOutboundTrip] = useState<Trip | null>(null);
  const [inboundTrip, setInboundTrip] = useState<Trip | null>(null);
  const [inboundTrips, setInboundTrips] = useState<Trip[]>([]);

  const [passengerFirstName, setPassengerFirstName] = useState("");
  const [passengerLastName, setPassengerLastName] = useState("");
  const [passengerEmail, setPassengerEmail] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);

  // ── Hold state ─────────────────────────────────────────────────────────────
  const [outboundHoldId, setOutboundHoldId] = useState<string | null>(null);
  const [inboundHoldId, setInboundHoldId] = useState<string | null>(null);
  const [outboundExpiresAt, setOutboundExpiresAt] = useState<Date | null>(null);
  const [inboundExpiresAt, setInboundExpiresAt] = useState<Date | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const [bookingGroupId, setBookingGroupId] = useState<string | null>(null);

  // ── Shared UI state ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/routes")
      .then((res) => res.json())
      .then((data) => {
        setOrigins(data.origins);
        setAllRoutes(data.routes);
        setRegions(data.regions ?? {});
      });
  }, []);

  // Countdown: show the minimum remaining time across all active holds
  useEffect(() => {
    const expiries = [outboundExpiresAt, inboundExpiresAt].filter(Boolean) as Date[];
    if (expiries.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const minExpiry = Math.min(...expiries.map((d) => d.getTime()));
      const secondsLeft = Math.max(0, Math.floor((minExpiry - now) / 1000));
      setHoldSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        clearInterval(interval);
        setOutboundHoldId(null);
        setInboundHoldId(null);
        setOutboundExpiresAt(null);
        setInboundExpiresAt(null);
        setBookStep("results");
        setError("Your seat hold has expired. Please select a trip again.");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [outboundExpiresAt, inboundExpiresAt]);

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ── Book handlers ──────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const params = new URLSearchParams({ origin, destination, date, seatCount: String(seatCount) });
    const res = await fetch(`/api/trips?${params}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    setTrips(data.trips);
    setBookStep("results");
  }

  async function handleSelectTrip(trip: Trip) {
    setError("");
    setLoading(true);
    const newGroupId = crypto.randomUUID();
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, seatCount, bookingGroupId: newGroupId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      if (res.status === 409) {
        setTrips([]);
        setBookStep("search");
        setError("Someone just booked the last available seat. Please search again.");
      } else {
        setError(data.error ?? "Something went wrong");
      }
      return;
    }
    setOutboundHoldId(data.holdId);
    setOutboundExpiresAt(new Date(data.expiresAt));
    setHoldSecondsLeft(5 * 60);
    setOutboundTrip(trip);
    setBookingGroupId(newGroupId);

    if (tripType === "round-trip") {
      // Fetch return trips (origin/destination swapped)
      const returnParams = new URLSearchParams({
        origin: trip.destination,
        destination: origin,
        date: returnDate,
        seatCount: String(seatCount),
      });
      const returnRes = await fetch(`/api/trips?${returnParams}`);
      const returnData = await returnRes.json();
      if (returnRes.ok) {
        setInboundTrips(returnData.trips);
      }
      setBookStep("return-results");
    } else {
      setBookStep("booking");
    }
  }

  async function handleSelectReturnTrip(trip: Trip) {
    setError("");
    setLoading(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, seatCount, bookingGroupId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      if (res.status === 409) {
        setInboundTrips([]);
        setError("Someone just booked the last available seat on the return trip. Please choose another.");
      } else {
        setError(data.error ?? "Something went wrong");
      }
      return;
    }
    setInboundHoldId(data.holdId);
    setInboundExpiresAt(new Date(data.expiresAt));
    setInboundTrip(trip);
    setBookStep("booking");
  }

  async function handleBooking(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const passengerName = `${passengerFirstName.trim()} ${passengerLastName.trim()}`;

    if (tripType === "round-trip" && outboundHoldId && inboundHoldId) {
      const res = await fetch("/api/bookings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundHoldId, inboundHoldId, passengerName, passengerEmail, passengerPhone }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      setOutboundHoldId(null);
      setInboundHoldId(null);
      setOutboundExpiresAt(null);
      setInboundExpiresAt(null);
      setBooking({
        bookingGroupId: data.bookingGroupId,
        passengerName: data.passengerName,
        passengerEmail: data.passengerEmail,
        tripType: "round-trip",
        outbound: data.outbound,
        inbound: data.inbound,
        totalPriceDisplay: data.totalPriceDisplay,
      });
      setBookStep("confirmation");
    } else {
      // One-way flow
      const res = await fetch(`/api/reservations/${outboundHoldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", passengerName, passengerEmail, passengerPhone }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      setOutboundHoldId(null);
      setOutboundExpiresAt(null);
      setBooking({
        passengerName: data.passengerName,
        passengerEmail: data.passengerEmail,
        tripType: "one-way",
        outbound: {
          confirmationId: data.confirmationId,
          origin: data.origin,
          destination: data.destination,
          departureTime: data.departureTime,
          arrivalTime: data.arrivalTime,
          priceDisplay: data.priceDisplay,
          seatCount: data.seatCount,
        },
        totalPriceDisplay: data.priceDisplay,
      });
      setBookStep("confirmation");
    }
  }

  async function handleBackFromBooking() {
    if (tripType === "round-trip") {
      // Cancel both holds
      if (outboundHoldId) {
        await fetch(`/api/reservations/${outboundHoldId}`, { method: "DELETE" });
        setOutboundHoldId(null);
        setOutboundExpiresAt(null);
      }
      if (inboundHoldId) {
        await fetch(`/api/reservations/${inboundHoldId}`, { method: "DELETE" });
        setInboundHoldId(null);
        setInboundExpiresAt(null);
      }
      setOutboundTrip(null);
      setInboundTrip(null);
      setInboundTrips([]);
      setBookingGroupId(null);
    } else {
      if (outboundHoldId) {
        await fetch(`/api/reservations/${outboundHoldId}`, { method: "DELETE" });
        setOutboundHoldId(null);
        setOutboundExpiresAt(null);
      }
      setOutboundTrip(null);
    }
    // Re-fetch trips so seat counts reflect the restored hold
    const params = new URLSearchParams({ origin, destination, date, seatCount: String(seatCount) });
    const res = await fetch(`/api/trips?${params}`);
    const data = await res.json();
    if (res.ok) setTrips(data.trips);
    setBookStep("results");
    setError("");
  }

  async function handleBackFromReturnResults() {
    // Cancel the outbound hold
    if (outboundHoldId) {
      await fetch(`/api/reservations/${outboundHoldId}`, { method: "DELETE" });
      setOutboundHoldId(null);
      setOutboundExpiresAt(null);
    }
    setOutboundTrip(null);
    setBookingGroupId(null);
    setInboundTrips([]);

    // Re-fetch outbound trips
    const params = new URLSearchParams({ origin, destination, date, seatCount: String(seatCount) });
    const res = await fetch(`/api/trips?${params}`);
    const data = await res.json();
    if (res.ok) setTrips(data.trips);
    setBookStep("results");
    setError("");
  }

  function handleBookReset() {
    setBookStep("search");
    setTrips([]);
    setOutboundTrip(null);
    setInboundTrip(null);
    setInboundTrips([]);
    setPassengerFirstName("");
    setPassengerLastName("");
    setPassengerEmail("");
    setPassengerPhone("");
    setSeatCount(1);
    setBooking(null);
    setOutboundHoldId(null);
    setInboundHoldId(null);
    setOutboundExpiresAt(null);
    setInboundExpiresAt(null);
    setBookingGroupId(null);
    setTripType("one-way");
    setReturnDate("");
    setError("");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">

      {/* Header */}
      <header className="bg-black text-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-widest">LAND</span>
            <div className="flex gap-0.5">
              <div className="w-0.5 h-5 bg-yellow-400" />
              <div className="w-0.5 h-5 bg-yellow-600" />
            </div>
            <span className="text-xl font-bold tracking-widest">NE</span>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <span className="px-4 py-1.5 rounded-md text-sm font-medium bg-yellow-400 text-black">
              Book
            </span>
            <a href="/manage" className="px-4 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Manage Booking
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">

        {/* Step 1: Search */}
            {bookStep === "search" && (
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">Book a Shuttle</h1>
                <p className="text-zinc-500 mb-8">Select your route and travel date to see available trips.</p>
                <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">

                  {/* One Way / Round Trip toggle */}
                  <div className="flex rounded-lg overflow-hidden border border-zinc-300">
                    <button type="button" onClick={() => setTripType("one-way")}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${tripType === "one-way" ? "bg-yellow-400 text-black" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}>
                      One Way
                    </button>
                    <button type="button" onClick={() => setTripType("round-trip")}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${tripType === "round-trip" ? "bg-yellow-400 text-black" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}>
                      Round Trip
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Origin</label>
                    <select required value={origin} onChange={(e) => {
                        const newOrigin = e.target.value;
                        setOrigin(newOrigin);
                        // Only reset destination if it is no longer reachable from the new origin
                        if (destination && !allRoutes.some((r) => r.origin === newOrigin && r.destination === destination)) {
                          setDestination("");
                        }
                      }}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400">
                      <option value="">Select a pickup location</option>
                      {Object.keys(regions).length > 0
                        ? Object.entries(regions).map(([region, regionOrigins]) => {
                            const available = regionOrigins.filter((o) => filteredOrigins.includes(o));
                            if (available.length === 0) return null;
                            return (
                              <optgroup key={region} label={region}>
                                {available.map((o) => <option key={o} value={o}>{o}</option>)}
                              </optgroup>
                            );
                          })
                        : filteredOrigins.map((o) => <option key={o} value={o}>{o}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Destination</label>
                    <select required value={destination} onChange={(e) => {
                        const newDest = e.target.value;
                        setDestination(newDest);
                        // Only reset origin if it no longer has a route to the new destination
                        if (origin && !allRoutes.some((r) => r.origin === origin && r.destination === newDest)) {
                          setOrigin("");
                        }
                      }}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400">
                      <option value="">Select a destination</option>
                      {Object.keys(regions).length > 0
                        ? Object.entries(regions).map(([region, regionDests]) => {
                            const available = regionDests.filter((d) => destinations.includes(d));
                            if (available.length === 0) return null;
                            return (
                              <optgroup key={region} label={region}>
                                {available.map((d) => <option key={d} value={d}>{d}</option>)}
                              </optgroup>
                            );
                          })
                        : destinations.map((d) => <option key={d} value={d}>{d}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Travel Date</label>
                    <input required type="date" value={date}
                      min={new Date().toISOString().split("T")[0]}
                      max={returnDate || undefined}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setDate(newDate);
                        // If return date is now before the new travel date, clear it
                        if (returnDate && newDate > returnDate) setReturnDate("");
                      }}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  {tripType === "round-trip" && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Return Date</label>
                      <input required={tripType === "round-trip"} type="date" value={returnDate}
                        min={date || new Date().toISOString().split("T")[0]}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Number of Passengers</label>
                    <input required type="number" min={1} max={9} value={seatCount}
                      onChange={(e) => setSeatCount(Math.min(9, Math.max(1, Number(e.target.value))))}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <p className="text-xs text-zinc-400 mt-1">Maximum 9 passengers per booking</p>
                  </div>
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-50">
                    {loading ? "Searching..." : "Search Trips"}
                  </button>
                </form>
              </div>
            )}

            {/* Step 2: Outbound Results */}
            {bookStep === "results" && (
              <div>
                <button onClick={() => setBookStep("search")} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to search</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-1">
                  {tripType === "round-trip" ? "Select Outbound Trip" : "Available Trips"}
                </h2>
                <p className="text-zinc-500 mb-6">{origin} → {destination} &middot; {date}</p>

                {/* Passenger count adjuster */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm px-5 py-4 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-700">Number of Passengers</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Maximum 9 per booking</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSeatCount((c) => Math.max(1, c - 1))}
                      className="w-8 h-8 rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-semibold transition-colors flex items-center justify-center"
                    >-</button>
                    <span className="text-lg font-semibold text-zinc-900 w-4 text-center">{seatCount}</span>
                    <button
                      onClick={() => setSeatCount((c) => Math.min(9, c + 1))}
                      className="w-8 h-8 rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 font-semibold transition-colors flex items-center justify-center"
                    >+</button>
                  </div>
                </div>

                {trips.length === 0 ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">No trips available for this route and date.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {trips.map((trip) => {
                      const soldOut = trip.availableSeats === 0;
                      const notEnough = !soldOut && trip.availableSeats < seatCount;
                      const bookable = !soldOut && !notEnough;

                      return (
                        <div key={trip.id} className={`bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between ${soldOut ? "border-zinc-200 opacity-60" : "border-zinc-200"}`}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-semibold text-zinc-900">{trip.departureTime}</span>
                              <span className="text-zinc-400">→</span>
                              <span className="text-lg font-semibold text-zinc-900">{trip.arrivalTime}</span>
                            </div>
                            {soldOut && (
                              <span className="text-sm font-medium text-red-500">Sold out</span>
                            )}
                            {notEnough && (
                              <span className="text-sm font-medium text-red-500">
                                Only {trip.availableSeats} seat{trip.availableSeats !== 1 ? "s" : ""} available
                              </span>
                            )}
                            {bookable && (
                              <span className="text-sm text-zinc-500">{trip.availableSeats} seats available</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xl font-bold text-zinc-900">
                                ${((trip.priceCents * seatCount) / 100).toFixed(2)}
                              </p>
                              {seatCount > 1 && (
                                <p className="text-xs text-zinc-400">{seatCount} × {trip.priceDisplay}</p>
                              )}
                            </div>
                            {soldOut ? (
                              <span className="bg-zinc-100 text-zinc-400 font-semibold rounded-lg px-4 py-2 text-sm">Sold Out</span>
                            ) : (
                              <button
                                onClick={() => { if (bookable && !loading) handleSelectTrip(trip); }}
                                disabled={!bookable || loading}
                                className={`font-semibold rounded-lg px-4 py-2 transition-colors ${bookable && !loading ? "bg-yellow-400 hover:bg-yellow-500 text-black" : "bg-zinc-200 text-zinc-400 cursor-not-allowed"}`}
                              >
                                {loading ? "Holding..." : "Select"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 2b: Return Results (round-trip only) */}
            {bookStep === "return-results" && outboundTrip && (
              <div>
                <button onClick={handleBackFromReturnResults} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to outbound trips</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-1">Select Return Trip</h2>
                <p className="text-zinc-500 mb-4">{outboundTrip.destination} → {origin} &middot; {returnDate}</p>

                {/* Countdown banner */}
                {holdSecondsLeft > 0 && (
                  <div className={`rounded-xl px-5 py-3 mb-4 flex items-center justify-between border ${
                    holdSecondsLeft < 60
                      ? "bg-red-50 border-red-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <span className={`text-sm font-medium ${holdSecondsLeft < 60 ? "text-red-700" : "text-yellow-700"}`}>
                      {holdSecondsLeft < 60 ? "Hold expiring soon!" : "Outbound seat held for you"}
                    </span>
                    <span className={`font-mono font-bold text-lg ${holdSecondsLeft < 60 ? "text-red-700" : "text-yellow-700"}`}>
                      {formatCountdown(holdSecondsLeft)}
                    </span>
                  </div>
                )}

                {/* Outbound trip summary */}
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Your Outbound Trip</p>
                  <div className="bg-black text-white rounded-xl p-5">
                    <p className="text-zinc-400 text-sm mb-1">{outboundTrip.origin} → {outboundTrip.destination}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold">{outboundTrip.departureTime}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-lg font-semibold">{outboundTrip.arrivalTime}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-400 text-xl font-bold">
                          ${((outboundTrip.priceCents * seatCount) / 100).toFixed(2)}
                        </p>
                        {seatCount > 1 && (
                          <p className="text-zinc-400 text-xs">{seatCount} x {outboundTrip.priceDisplay}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Available Return Trips</p>
                {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                {inboundTrips.length === 0 ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">No return trips available for this date.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {inboundTrips.map((trip) => {
                      const soldOut = trip.availableSeats === 0;
                      const notEnough = !soldOut && trip.availableSeats < seatCount;
                      const bookable = !soldOut && !notEnough;

                      return (
                        <div key={trip.id} className={`bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between ${soldOut ? "border-zinc-200 opacity-60" : "border-zinc-200"}`}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-semibold text-zinc-900">{trip.departureTime}</span>
                              <span className="text-zinc-400">→</span>
                              <span className="text-lg font-semibold text-zinc-900">{trip.arrivalTime}</span>
                            </div>
                            {soldOut && <span className="text-sm font-medium text-red-500">Sold out</span>}
                            {notEnough && (
                              <span className="text-sm font-medium text-red-500">
                                Only {trip.availableSeats} seat{trip.availableSeats !== 1 ? "s" : ""} available
                              </span>
                            )}
                            {bookable && <span className="text-sm text-zinc-500">{trip.availableSeats} seats available</span>}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xl font-bold text-zinc-900">
                                ${((trip.priceCents * seatCount) / 100).toFixed(2)}
                              </p>
                              {seatCount > 1 && (
                                <p className="text-xs text-zinc-400">{seatCount} × {trip.priceDisplay}</p>
                              )}
                            </div>
                            {soldOut ? (
                              <span className="bg-zinc-100 text-zinc-400 font-semibold rounded-lg px-4 py-2 text-sm">Sold Out</span>
                            ) : (
                              <button
                                onClick={() => { if (bookable && !loading) handleSelectReturnTrip(trip); }}
                                disabled={!bookable || loading}
                                className={`font-semibold rounded-lg px-4 py-2 transition-colors ${bookable && !loading ? "bg-yellow-400 hover:bg-yellow-500 text-black" : "bg-zinc-200 text-zinc-400 cursor-not-allowed"}`}
                              >
                                {loading ? "Holding..." : "Select"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Booking Form */}
            {bookStep === "booking" && outboundTrip && (
              <div>
                <button onClick={handleBackFromBooking} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to results</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-6">Passenger Details</h2>
                {holdSecondsLeft > 0 && (
                  <div className={`rounded-xl px-5 py-3 mb-4 flex items-center justify-between border ${
                    holdSecondsLeft < 60
                      ? "bg-red-50 border-red-200"
                      : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <span className={`text-sm font-medium ${holdSecondsLeft < 60 ? "text-red-700" : "text-yellow-700"}`}>
                      {holdSecondsLeft < 60 ? "Hold expiring soon!" : "Seats held for you"}
                    </span>
                    <span className={`font-mono font-bold text-lg ${holdSecondsLeft < 60 ? "text-red-700" : "text-yellow-700"}`}>
                      {formatCountdown(holdSecondsLeft)}
                    </span>
                  </div>
                )}

                {/* Trip summary card(s) */}
                {tripType === "one-way" ? (
                  <div className="bg-black text-white rounded-xl p-5 mb-6">
                    <p className="text-zinc-400 text-sm mb-1">{outboundTrip.origin} → {outboundTrip.destination}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold">{outboundTrip.departureTime}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-lg font-semibold">{outboundTrip.arrivalTime}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-400 text-xl font-bold">
                          ${((outboundTrip.priceCents * seatCount) / 100).toFixed(2)}
                        </p>
                        {seatCount > 1 && (
                          <p className="text-zinc-400 text-xs">{seatCount} x {outboundTrip.priceDisplay}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 flex flex-col gap-3">
                    {/* Outbound card */}
                    <div className="bg-black text-white rounded-xl p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Outbound</p>
                      <p className="text-zinc-400 text-sm mb-1">{outboundTrip.origin} → {outboundTrip.destination}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-semibold">{outboundTrip.departureTime}</span>
                          <span className="text-zinc-500">→</span>
                          <span className="text-lg font-semibold">{outboundTrip.arrivalTime}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-yellow-400 text-xl font-bold">
                            ${((outboundTrip.priceCents * seatCount) / 100).toFixed(2)}
                          </p>
                          {seatCount > 1 && (
                            <p className="text-zinc-400 text-xs">{seatCount} x {outboundTrip.priceDisplay}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Return card */}
                    {inboundTrip && (
                      <div className="bg-zinc-800 text-white rounded-xl p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Return</p>
                        <p className="text-zinc-400 text-sm mb-1">{inboundTrip.origin} → {inboundTrip.destination}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold">{inboundTrip.departureTime}</span>
                            <span className="text-zinc-500">→</span>
                            <span className="text-lg font-semibold">{inboundTrip.arrivalTime}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-yellow-400 text-xl font-bold">
                              ${((inboundTrip.priceCents * seatCount) / 100).toFixed(2)}
                            </p>
                            {seatCount > 1 && (
                              <p className="text-zinc-400 text-xs">{seatCount} x {inboundTrip.priceDisplay}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Total row */}
                    {inboundTrip && (
                      <div className="flex items-center justify-between bg-white rounded-xl border border-zinc-200 px-5 py-3">
                        <span className="text-sm font-medium text-zinc-700">Total</span>
                        <span className="text-lg font-bold text-zinc-900">
                          ${(((outboundTrip.priceCents + inboundTrip.priceCents) * seatCount) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleBooking} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-zinc-700">Name</label>
                      <span className="text-xs text-zinc-400">Please enter full legal names as they appear on your ID</span>
                    </div>
                    <div className="flex gap-3">
                      <input required type="text" placeholder="First name" value={passengerFirstName}
                        onChange={(e) => setPassengerFirstName(e.target.value)}
                        minLength={2}
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                      <input required type="text" placeholder="Last name" value={passengerLastName}
                        onChange={(e) => setPassengerLastName(e.target.value)}
                        minLength={2}
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Email Address</label>
                    <input required type="email" placeholder="jane@example.com" value={passengerEmail}
                      onChange={(e) => setPassengerEmail(e.target.value)}
                      pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Phone Number</label>
                    <input required type="tel" placeholder="(555) 123-4567" value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      pattern="^\+?1?\s*[\(\-\.]?\d{3}[\)\-\.\s]?\s*\d{3}[\-\.\s]?\d{4}$"
                      title="Please enter a valid US phone number (e.g. 555-123-4567)"
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <p className="text-xs text-zinc-400 mt-1">Format: 555-123-4567 or (555) 123-4567</p>
                  </div>
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-50">
                    {loading ? "Confirming..." : "Confirm Booking"}
                  </button>
                </form>
              </div>
            )}

            {/* Step 4: Confirmation */}
            {bookStep === "confirmation" && booking && (
              <div className="text-center">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="text-2xl font-bold text-zinc-900 mb-2">Booking Confirmed</h2>
                <p className="text-zinc-500 mb-8">A summary of your trip is below.</p>
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 text-left max-w-md mx-auto mb-6">

                  {booking.tripType === "one-way" ? (
                    <>
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-100">
                        <span className="text-sm text-zinc-500">Confirmation ID</span>
                        <span className="font-mono text-sm font-semibold text-zinc-900">{booking.outbound.confirmationId}</span>
                      </div>
                      <div className="flex flex-col gap-3 text-sm">
                        <div className="flex justify-between"><span className="text-zinc-500">Passenger</span><span className="font-medium text-zinc-900">{booking.passengerName}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Passengers</span><span className="font-medium text-zinc-900">{booking.outbound.seatCount}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Email</span><span className="font-medium text-zinc-900">{booking.passengerEmail}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Route</span><span className="font-medium text-zinc-900 text-right max-w-[60%]">{booking.outbound.origin} → {booking.outbound.destination}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Departure</span><span className="font-medium text-zinc-900">{booking.outbound.departureTime}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Arrival</span><span className="font-medium text-zinc-900">{booking.outbound.arrivalTime}</span></div>
                        <div className="flex justify-between pt-3 border-t border-zinc-100"><span className="text-zinc-500">Total Paid</span><span className="font-bold text-zinc-900">{booking.totalPriceDisplay}</span></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-4 pb-4 border-b border-zinc-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-zinc-500">Passenger</span>
                          <span className="font-medium text-zinc-900 text-sm">{booking.passengerName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-zinc-500">Email</span>
                          <span className="font-medium text-zinc-900 text-sm">{booking.passengerEmail}</span>
                        </div>
                      </div>

                      {/* Outbound leg */}
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Outbound</p>
                        <div className="flex flex-col gap-2 text-sm">
                          <div className="flex justify-between"><span className="text-zinc-500">Confirmation ID</span><span className="font-mono text-xs font-semibold text-zinc-900">{booking.outbound.confirmationId}</span></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Route</span><span className="font-medium text-zinc-900">{booking.outbound.origin} → {booking.outbound.destination}</span></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Departure</span><span className="font-medium text-zinc-900">{booking.outbound.departureTime}</span></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Arrival</span><span className="font-medium text-zinc-900">{booking.outbound.arrivalTime}</span></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Price</span><span className="font-medium text-zinc-900">{booking.outbound.priceDisplay}</span></div>
                        </div>
                      </div>

                      {/* Return leg */}
                      {booking.inbound && (
                        <div className="mb-4 pt-4 border-t border-zinc-100">
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Return</p>
                          <div className="flex flex-col gap-2 text-sm">
                            <div className="flex justify-between"><span className="text-zinc-500">Confirmation ID</span><span className="font-mono text-xs font-semibold text-zinc-900">{booking.inbound.confirmationId}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Route</span><span className="font-medium text-zinc-900">{booking.inbound.origin} → {booking.inbound.destination}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Departure</span><span className="font-medium text-zinc-900">{booking.inbound.departureTime}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Arrival</span><span className="font-medium text-zinc-900">{booking.inbound.arrivalTime}</span></div>
                            <div className="flex justify-between"><span className="text-zinc-500">Price</span><span className="font-medium text-zinc-900">{booking.inbound.priceDisplay}</span></div>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between pt-3 border-t border-zinc-100 text-sm">
                        <span className="text-zinc-500 font-medium">Total Paid</span>
                        <span className="font-bold text-zinc-900">{booking.totalPriceDisplay}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleBookReset}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors">
                    Book Another Trip
                  </button>
                  <a href={`/manage?id=${booking.outbound.confirmationId}`}
                    className="bg-white hover:bg-zinc-50 text-zinc-700 font-semibold rounded-lg px-6 py-2.5 border border-zinc-200 transition-colors">
                    Manage This Booking
                  </a>
                </div>
              </div>
            )}

      </main>
    </div>
  );
}
