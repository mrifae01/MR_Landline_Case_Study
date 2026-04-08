import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Region groupings for the search dropdowns.
// Add new locations here when new routes are seeded.
const REGIONS: Record<string, string[]> = {
  Colorado: [
    "Denver International Airport",
    "Fort Collins - CSU Transit Center",
    "Fort Collins - Harmony Transfer Center (HTC)",
    "Northern Colorado Regional Airport - FREE Parking (FNL)",
  ],
  Minnesota: [
    "Duluth International Airport (DLH)",
    "MSP Terminal-1 Lindbergh (MSA)",
    "MSP Terminal-2 Humphrey (MSB)",
  ],
};

// GET /api/routes
// Returns all unique origins, destinations, routes, and region groupings
// for the search dropdowns.
export async function GET() {
  const routes = await prisma.route.findMany({
    orderBy: { origin: "asc" },
  });

  const origins = [...new Set(routes.map((r) => r.origin))].sort();
  const destinations = [...new Set(routes.map((r) => r.destination))].sort();

  return NextResponse.json({ origins, destinations, routes, regions: REGIONS });
}
