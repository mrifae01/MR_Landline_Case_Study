// This is the main "Manage Booking" page where users can look up their reservations using a confirmation ID or email, view their current bookings, and modify or cancel them. It handles all the client-side logic and UI for managing bookings.

"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  bookingGroupId?: string | null;
}

interface Trip {
  id: string;
  departureTime: string;
  arrivalTime: string;
  priceCents: number;
  priceDisplay: string;
  availableSeats: number;
}

type Step = "lookup" | "view" | "modify-search" | "modify-results";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagePage() {
  return (
    <Suspense>
      <ManagePageInner />
    </Suspense>
  );
}

function ManagePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<Step>("lookup");
  const [query, setQuery] = useState("");
  const [reservations, setReservations] = useState<ManagedReservation[]>([]);
  const [modifyingReservation, setModifyingReservation] = useState<ManagedReservation | null>(null);
  const [modifyDate, setModifyDate] = useState("");
  const [modifyDateMin, setModifyDateMin] = useState("");
  const [modifyDateMax, setModifyDateMax] = useState("");
  const [modifyTrips, setModifyTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // ── Auto-lookup if ?id= is in the URL ─────────────────────────────────────

  const lookupById = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/reservations?id=${id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok || data.reservations.length === 0) {
      setError("No booking found for this confirmation ID.");
      return;
    }
    setReservations(data.reservations);
    setStep("view");
  }, []);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setQuery(id);
      lookupById(id);
    }
  }, [searchParams, lookupById]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const isId = !query.includes("@");
    const params = new URLSearchParams(isId ? { id: query } : { email: query });
    const res = await fetch(`/api/reservations?${params}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    if (data.reservations.length === 0) { setError("No bookings found. Check your confirmation ID or email."); return; }
    setReservations(data.reservations);
    setStep("view");
  }

  async function handleCancel(reservation: ManagedReservation) {
    if (!confirm(`Cancel your ${reservation.departureTime} trip from ${reservation.origin}?`)) return;
    setError("");
    setLoading(true);
    const res = await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    setReservations((prev) => prev.filter((r) => r.id !== reservation.id));
    setSuccessMessage("Your booking has been cancelled.");
  }

  async function handleCancelGroup(reservation: ManagedReservation) {
    if (!confirm(`Cancel your entire round trip (both legs)?`)) return;
    setError("");
    setLoading(true);
    const res = await fetch(`/api/reservations/${reservation.id}?cancelGroup=true`, { method: "DELETE" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
    setReservations((prev) =>
      prev.filter((r) => r.bookingGroupId !== reservation.bookingGroupId)
    );
    setSuccessMessage("Both legs of your round trip have been cancelled.");
  }

  function handleStartModify(reservation: ManagedReservation) {
    setModifyingReservation(reservation);
    setModifyDate("");
    setModifyTrips([]);
    setError("");

    const today = new Date().toISOString().split("T")[0];
    let min = today;
    let max = "";

    if (reservation.bookingGroupId) {
      const otherLeg = reservations.find(
        (r) => r.bookingGroupId === reservation.bookingGroupId && r.id !== reservation.id
      );
      if (otherLeg) {
        const otherDate = otherLeg.departureDate.slice(0, 10);
        const thisDate = reservation.departureDate.slice(0, 10);
        if (thisDate <= otherDate) {
          // This is the outbound leg — cannot go past the return date
          max = otherDate;
        } else {
          // This is the return leg — cannot go before the outbound date
          min = otherDate > today ? otherDate : today;
        }
      }
    }
    setModifyDateMin(min);
    setModifyDateMax(max);
    setStep("modify-search");
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
    setStep("modify-results");
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
    // Update the URL to the new confirmation ID and reload the booking
    router.replace(`/manage?id=${data.confirmationId}`);
    setSuccessMessage("Your booking has been updated successfully.");
    setStep("lookup");
    lookupById(data.confirmationId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">

      {/* Header */}
      <header className="bg-black text-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-widest">LAND</span>
            <div className="flex gap-0.5">
              <div className="w-0.5 h-5 bg-yellow-400" />
              <div className="w-0.5 h-5 bg-yellow-600" />
            </div>
            <span className="text-xl font-bold tracking-widest">NE</span>
          </a>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <a href="/" className="px-4 py-1.5 rounded-md text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Book
            </a>
            <span className="px-4 py-1.5 rounded-md text-sm font-medium bg-yellow-400 text-black">
              Manage Booking
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">

        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 mb-6 text-sm font-medium">
            {successMessage}
          </div>
        )}

        {/* Lookup */}
        {step === "lookup" && (
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">Manage Booking</h1>
            <p className="text-zinc-500 mb-8">Enter your confirmation ID or email to find your booking.</p>
            <form onSubmit={handleLookup} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Confirmation ID or Email</label>
                <input required type="text" placeholder="e.g. 3f7a2b1c-... or jane@example.com"
                  value={query} onChange={(e) => setQuery(e.target.value)}
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
        {step === "view" && (
          <div>
            <button onClick={() => { setStep("lookup"); setError(""); setSuccessMessage(""); }}
              className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">
              ← Search again
            </button>
            <h2 className="text-2xl font-bold text-zinc-900 mb-6">Your Bookings</h2>
            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
            {reservations.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">
                All bookings have been cancelled.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {(() => {
                  const seen = new Set<string>();
                  const groups: Array<{ key: string; legs: ManagedReservation[] }> = [];
                  for (const r of reservations) {
                    if (r.bookingGroupId) {
                      if (!seen.has(r.bookingGroupId)) {
                        seen.add(r.bookingGroupId);
                        const legs = reservations.filter((x) => x.bookingGroupId === r.bookingGroupId);
                        groups.push({ key: r.bookingGroupId, legs });
                      }
                    } else {
                      groups.push({ key: r.id, legs: [r] });
                    }
                  }
                  return groups.map(({ key, legs }) => {
                    if (legs.length === 1) {
                      const r = legs[0];
                      return (
                        <div key={key} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-sm text-zinc-500 mb-0.5">{r.origin} → {r.destination}</p>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-900">{r.departureTime}</span>
                                <span className="text-zinc-400">→</span>
                                <span className="font-semibold text-zinc-900">{r.arrivalTime}</span>
                              </div>
                              <p className="text-sm text-zinc-500 mt-1">
                                {new Date(r.departureDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                              </p>
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
                      );
                    }

                    // Round-trip group
                    const sorted = [...legs].sort(
                      (a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime()
                    );
                    const outboundLeg = sorted[0];
                    const inboundLeg = sorted[1];
                    const totalCents = legs.reduce((sum, l) => {
                      return sum + parseFloat(l.priceDisplay.replace(/[^0-9.]/g, "")) * 100;
                    }, 0);
                    const totalDisplay = `$${(totalCents / 100).toFixed(2)}`;

                    return (
                      <div key={key} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                            Round Trip
                          </span>
                          <span className="font-bold text-zinc-900">{totalDisplay} total</span>
                        </div>

                        <div className="mb-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Outbound</p>
                          <p className="text-sm text-zinc-500 mb-0.5">{outboundLeg.origin} → {outboundLeg.destination}</p>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">{outboundLeg.departureTime}</span>
                            <span className="text-zinc-400">→</span>
                            <span className="font-semibold text-zinc-900">{outboundLeg.arrivalTime}</span>
                          </div>
                          <p className="text-sm text-zinc-500 mt-1">{new Date(outboundLeg.departureDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="font-mono text-xs text-zinc-400">{outboundLeg.id}</span>
                            <span className="text-sm text-zinc-600">{outboundLeg.priceDisplay}</span>
                          </div>
                        </div>

                        {inboundLeg && (
                          <div className="pt-3 border-t border-zinc-100 mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Return</p>
                            <p className="text-sm text-zinc-500 mb-0.5">{inboundLeg.origin} → {inboundLeg.destination}</p>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900">{inboundLeg.departureTime}</span>
                              <span className="text-zinc-400">→</span>
                              <span className="font-semibold text-zinc-900">{inboundLeg.arrivalTime}</span>
                            </div>
                            <p className="text-sm text-zinc-500 mt-1">{new Date(inboundLeg.departureDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="font-mono text-xs text-zinc-400">{inboundLeg.id}</span>
                              <span className="text-sm text-zinc-600">{inboundLeg.priceDisplay}</span>
                            </div>
                          </div>
                        )}

                        <p className="text-sm text-zinc-500 mb-3">{outboundLeg.seatCount} passenger{outboundLeg.seatCount !== 1 ? "s" : ""}</p>

                        <div className="flex flex-wrap gap-2 pt-3 border-t border-zinc-100">
                          <button onClick={() => handleStartModify(outboundLeg)}
                            className="bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors">
                            Change Outbound
                          </button>
                          {inboundLeg && (
                            <button onClick={() => handleStartModify(inboundLeg)}
                              className="bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors">
                              Change Return
                            </button>
                          )}
                          {inboundLeg && (
                            <button onClick={() => handleCancel(inboundLeg)} disabled={loading}
                              className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                              Cancel Return Leg
                            </button>
                          )}
                          <button onClick={() => handleCancelGroup(outboundLeg)} disabled={loading}
                            className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                            Cancel Entire Trip
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* Modify: pick new date */}
        {step === "modify-search" && modifyingReservation && (
          <div>
            <button onClick={() => { setStep("view"); setError(""); }}
              className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">
              ← Back to bookings
            </button>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Change Trip</h2>
            <p className="text-zinc-500 mb-6">Select a new date on the same route.</p>
            <div className="bg-black text-white rounded-xl p-4 mb-6 text-sm">
              <p className="text-zinc-400 mb-1">Current booking</p>
              <p className="font-medium">{modifyingReservation.origin} → {modifyingReservation.destination}</p>
              <p className="text-zinc-400">
                {modifyingReservation.departureTime} · {new Date(modifyingReservation.departureDate).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}
              </p>
            </div>
            <form onSubmit={handleModifySearch} className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">New Travel Date</label>
                <input required type="date" value={modifyDate}
                  min={modifyDateMin}
                  max={modifyDateMax || undefined}
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
        {step === "modify-results" && modifyingReservation && (
          <div>
            <button onClick={() => { setStep("modify-search"); setError(""); }}
              className="text-sm text-zinc-500 hover:text-zinc-800 mb-4 flex items-center gap-1">
              ← Back to date selection
            </button>
            <h2 className="text-2xl font-bold text-zinc-900 mb-1">Select a New Trip</h2>
            <p className="text-zinc-500 mb-6">
              {modifyingReservation.origin} → {modifyingReservation.destination} · {modifyDate}
            </p>

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
              <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center text-zinc-500">
                No trips available on this date.
              </div>
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
                          <p className="text-xs text-zinc-400">{modifyingReservation?.seatCount} × {trip.priceDisplay}</p>
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

      </main>
    </div>
  );
}
