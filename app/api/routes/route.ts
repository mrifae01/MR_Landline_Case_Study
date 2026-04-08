import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/routes
// Returns all unique origins and destinations for the search dropdowns.
export async function GET() {
  const routes = await prisma.route.findMany({
    orderBy: { origin: "asc" },
  });

  // Pull out unique origins and destinations for the dropdown lists
  const origins = [...new Set(routes.map((r) => r.origin))].sort();
  const destinations = [...new Set(routes.map((r) => r.destination))].sort();

  return NextResponse.json({ origins, destinations, routes });
}
