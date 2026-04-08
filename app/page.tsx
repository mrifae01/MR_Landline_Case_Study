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
  confirmationId: string;
  passengerName: string;
  passengerEmail: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  priceDisplay: string;
  seatCount: number;
}

interface ManagedReservation {
  id: string;
  status: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  seatCount: number;
  priceDisplay: string;
  tripId: string;
}

type BookStep = "search" | "results" | "booking" | "confirmation";
type ManageStep = "lookup" | "view" | "modify-search" | "modify-results";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<"book" | "manage">("book");

  // ── Book flow state ────────────────────────────────────────────────────────
  const [bookStep, setBookStep] = useState<BookStep>("search");
  const [origins, setOrigins] = useState<string[]>([]);
  const [allRoutes, setAllRoutes] = useState<{ origin: string; destination: string }[]>([]);
  const [regions, setRegions] = useState<Record<string, string[]>>({});
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [seatCount, setSeatCount] = useState(1);
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
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [passengerFirstName, setPassengerFirstName] = useState("");
  const [passengerLastName, setPassengerLastName] = useState("");
  const [passengerEmail, setPassengerEmail] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [booking, setBooking] = useState<BookingConfirmation | null>(null);

  // ── Manage flow state ──────────────────────────────────────────────────────
  const [manageStep, setManageStep] = useState<ManageStep>("lookup");
  const [manageQuery, setManageQuery] = useState("");
  const [managedReservations, setManagedReservations] = useState<ManagedReservation[]>([]);
  const [modifyingReservation, setModifyingReservation] = useState<ManagedReservation | null>(null);
  const [modifyDate, setModifyDate] = useState("");
  const [modifyTrips, setModifyTrips] = useState<Trip[]>([]);

  // ── Hold state ─────────────────────────────────────────────────────────────
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);

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

  useEffect(() => {
    if (!holdExpiresAt) return;
    const interval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.floor((holdExpiresAt.getTime() - Date.now()) / 1000));
      setHoldSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        clearInterval(interval);
        setHoldId(null);
        setHoldExpiresAt(null);
        setBookStep("results");
        setError("Your seat hold has expired. Please select a trip again.");
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Clear errors when switching tabs
  function switchTab(tab: "book" | "manage") {
    setActiveTab(tab);
    setError("");
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
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId: trip.id, seatCount }),
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
    setHoldId(data.holdId);
    setHoldExpiresAt(new Date(data.expiresAt));
    setHoldSecondsLeft(5 * 60);
    setSelectedTrip(trip);
    setBookStep("booking");
  }

  async function handleBooking(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/reservations/${holdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", passengerName: `${passengerFirstName.trim()} ${passengerLastName.trim()}`, passengerEmail, passengerPhone }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    setHoldId(null);
    setHoldExpiresAt(null);
    setBooking(data);
    setBookStep("confirmation");
  }

  async function handleBackFromBooking() {
    if (holdId) {
      await fetch(`/api/reservations/${holdId}`, { method: "DELETE" });
      setHoldId(null);
      setHoldExpiresAt(null);
    }
    // Re-fetch trips so seat counts reflect the restored hold
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
    setSelectedTrip(null);
    setPassengerFirstName("");
    setPassengerLastName("");
    setPassengerEmail("");
    setPassengerPhone("");
    setSeatCount(1);
    setBooking(null);
    setHoldId(null);
    setHoldExpiresAt(null);
    setError("");
  }

  // ── Manage handlers ────────────────────────────────────────────────────────

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const isId = !manageQuery.includes("@");
    const params = new URLSearchParams(isId ? { id: manageQuery } : { email: manageQuery });
    const res = await fetch(`/api/reservations?${params}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    if (data.reservations.length === 0) { setError("No bookings found. Check your confirmation ID or email."); return; }
    setManagedReservations(data.reservations);
    setManageStep("view");
  }

  async function handleCancel(reservation: ManagedReservation) {
    if (!confirm(`Cancel your ${reservation.departureTime} trip from ${reservation.origin}?`)) return;
    setError("");
    setLoading(true);
    const res = await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    // Remove the cancelled reservation from the list
    setManagedReservations((prev) => prev.filter((r) => r.id !== reservation.id));
  }

  function handleStartModify(reservation: ManagedReservation) {
    setModifyingReservation(reservation);
    setModifyDate("");
    setModifyTrips([]);
    setError("");
    setManageStep("modify-search");
  }

  async function handleModifySearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const params = new URLSearchParams({
      origin: modifyingReservation!.origin,
      destination: modifyingReservation!.destination,
      date: modifyDate,
    });
    const res = await fetch(`/api/trips?${params}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    setModifyTrips(data.trips.filter((t: Trip) => t.id !== modifyingReservation!.tripId));
    setManageStep("modify-results");
  }

  async function handleConfirmModify(newTrip: Trip) {
    setError("");
    setLoading(true);
    const res = await fetch(`/api/reservations/${modifyingReservation!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newTripId: newTrip.id }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    // Show the new confirmation in the book tab
    setBooking(data);
    setBookStep("confirmation");
    setActiveTab("book");
    setManageStep("lookup");
    setManageQuery("");
    setManagedReservations([]);
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
          {/* Tab navigation */}
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => switchTab("book")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "book" ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"}`}
            >
              Book
            </button>
            <button
              onClick={() => switchTab("manage")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "manage" ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"}`}
            >
              Manage Booking
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">

        {/* ════════════════════════════════════════════
            BOOK TAB
        ════════════════════════════════════════════ */}
        {activeTab === "book" && (
          <>
            {/* Step 1: Search */}
            {bookStep === "search" && (
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">Book a Shuttle</h1>
                <p className="text-zinc-500 mb-8">Select your route and travel date to see available trips.</p>
                <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
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
                    <input required type="date" value={date} min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
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

            {/* Step 2: Results */}
            {bookStep === "results" && (
              <div>
                <button onClick={() => setBookStep("search")} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to search</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-1">Available Trips</h2>
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

            {/* Step 3: Booking Form */}
            {bookStep === "booking" && selectedTrip && (
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
                      {holdSecondsLeft < 60 ? "⚠ Hold expiring soon!" : "Seats held for you"}
                    </span>
                    <span className={`font-mono font-bold text-lg ${holdSecondsLeft < 60 ? "text-red-700" : "text-yellow-700"}`}>
                      {formatCountdown(holdSecondsLeft)}
                    </span>
                  </div>
                )}
                <div className="bg-black text-white rounded-xl p-5 mb-6">
                  <p className="text-zinc-400 text-sm mb-1">{selectedTrip.origin} → {selectedTrip.destination}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">{selectedTrip.departureTime}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="text-lg font-semibold">{selectedTrip.arrivalTime}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-yellow-400 text-xl font-bold">
                        ${((selectedTrip.priceCents * seatCount) / 100).toFixed(2)}
                      </p>
                      {seatCount > 1 && (
                        <p className="text-zinc-400 text-xs">{seatCount} x {selectedTrip.priceDisplay}</p>
                      )}
                    </div>
                  </div>
                </div>
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
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-100">
                    <span className="text-sm text-zinc-500">Confirmation ID</span>
                    <span className="font-mono text-sm font-semibold text-zinc-900">{booking.confirmationId}</span>
                  </div>
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-500">Passenger</span><span className="font-medium text-zinc-900">{booking.passengerName}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Passengers</span><span className="font-medium text-zinc-900">{booking.seatCount}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Email</span><span className="font-medium text-zinc-900">{booking.passengerEmail}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Route</span><span className="font-medium text-zinc-900 text-right max-w-[60%]">{booking.origin} → {booking.destination}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Departure</span><span className="font-medium text-zinc-900">{booking.departureTime}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-500">Arrival</span><span className="font-medium text-zinc-900">{booking.arrivalTime}</span></div>
                    <div className="flex justify-between pt-3 border-t border-zinc-100"><span className="text-zinc-500">Total Paid</span><span className="font-bold text-zinc-900">{booking.priceDisplay}</span></div>
                  </div>
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleBookReset}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors">
                    Book Another Trip
                  </button>
                  <button onClick={() => { switchTab("manage"); setManageQuery(booking.confirmationId); }}
                    className="bg-white hover:bg-zinc-50 text-zinc-700 font-semibold rounded-lg px-6 py-2.5 border border-zinc-200 transition-colors">
                    Manage This Booking
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════
            MANAGE TAB
        ════════════════════════════════════════════ */}
        {activeTab === "manage" && (
          <>
            {/* Lookup */}
            {manageStep === "lookup" && (
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 mb-1">Manage Booking</h2>
                <p className="text-zinc-500 mb-8">Enter your confirmation ID or email address to find your booking.</p>
                <form onSubmit={handleLookup} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Confirmation ID or Email</label>
                    <input required type="text" placeholder="e.g. 3f7a2b1c-... or jane@example.com"
                      value={manageQuery} onChange={(e) => setManageQuery(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-50">
                    {loading ? "Looking up..." : "Find Booking"}
                  </button>
                </form>
              </div>
            )}

            {/* View bookings */}
            {manageStep === "view" && (
              <div>
                <button onClick={() => { setManageStep("lookup"); setError(""); }} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to lookup</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-6">Your Bookings</h2>
                {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
                {managedReservations.length === 0 ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">
                    No bookings found
                    <button onClick={() => setManageStep("lookup")} className="block mx-auto mt-3 text-yellow-600 hover:underline text-sm">Search again</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {managedReservations.map((r) => (
                      <div key={r.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-sm text-zinc-500 mb-0.5">{r.origin} → {r.destination}</p>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900">{r.departureTime}</span>
                              <span className="text-zinc-400">→</span>
                              <span className="font-semibold text-zinc-900">{r.arrivalTime}</span>
                            </div>
                            <p className="text-sm text-zinc-500 mt-1">{new Date(r.departureDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</p>
                            <p className="text-sm text-zinc-500 mt-0.5">{r.seatCount} passenger{r.seatCount !== 1 ? "s" : ""}</p>
                          </div>
                          <span className="font-bold text-zinc-900">{r.priceDisplay}</span>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
                          <span className="font-mono text-xs text-zinc-400">{r.id}</span>
                          <div className="flex gap-2">
                            <button onClick={() => handleStartModify(r)}
                              className="bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors">
                              Change Trip
                            </button>
                            <button onClick={() => handleCancel(r)} disabled={loading}
                              className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Modify: pick new date */}
            {manageStep === "modify-search" && modifyingReservation && (
              <div>
                <button onClick={() => { setManageStep("view"); setError(""); }} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to bookings</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-2">Change Trip</h2>
                <p className="text-zinc-500 mb-6">Select a new date for your trip on the same route.</p>
                <div className="bg-black text-white rounded-xl p-4 mb-6 text-sm">
                  <p className="text-zinc-400 mb-1">Current booking</p>
                  <p className="font-medium">{modifyingReservation.origin} → {modifyingReservation.destination}</p>
                  <p className="text-zinc-400">{modifyingReservation.departureTime} · {new Date(modifyingReservation.departureDate).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}</p>
                </div>
                <form onSubmit={handleModifySearch} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">New Travel Date</label>
                    <input required type="date" value={modifyDate} min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setModifyDate(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  {error && <p className="text-red-600 text-sm">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-50">
                    {loading ? "Searching..." : "Find Available Trips"}
                  </button>
                </form>
              </div>
            )}

            {/* Modify: pick new trip */}
            {manageStep === "modify-results" && modifyingReservation && (
              <div>
                <button onClick={() => { setManageStep("modify-search"); setError(""); }} className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">← Back to date selection</button>
                <h2 className="text-2xl font-bold text-zinc-900 mb-1">Select a New Trip</h2>
                <p className="text-zinc-500 mb-6">{modifyingReservation.origin} → {modifyingReservation.destination} · {modifyDate}</p>

                {/* Current booking */}
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Current Booking</p>
                  <div className="bg-zinc-900 text-white rounded-xl p-4 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{modifyingReservation.departureTime}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="font-semibold">{modifyingReservation.arrivalTime}</span>
                      </div>
                      <span className="text-sm text-zinc-400">
                        {new Date(modifyingReservation.departureDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                        {" · "}{modifyingReservation.seatCount} passenger{modifyingReservation.seatCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="text-yellow-400 font-bold">{modifyingReservation.priceDisplay}</span>
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Available Trips</p>
                {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
                {modifyTrips.length === 0 ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">No trips available on this date.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {modifyTrips.map((trip) => (
                      <div key={trip.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-semibold text-zinc-900">{trip.departureTime}</span>
                            <span className="text-zinc-400">→</span>
                            <span className="text-lg font-semibold text-zinc-900">{trip.arrivalTime}</span>
                          </div>
                          <span className="text-sm text-zinc-500">{trip.availableSeats} seats available</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xl font-bold text-zinc-900">
                              ${((trip.priceCents * (modifyingReservation?.seatCount ?? 1)) / 100).toFixed(2)}
                            </p>
                            {(modifyingReservation?.seatCount ?? 1) > 1 && (
                              <p className="text-xs text-zinc-400">{modifyingReservation?.seatCount} 
                              x {trip.priceDisplay}</p>
                            )}
                          </div>
                          <button onClick={() => handleConfirmModify(trip)} disabled={loading}
                            className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
                            {loading ? "Updating..." : "Select"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}
