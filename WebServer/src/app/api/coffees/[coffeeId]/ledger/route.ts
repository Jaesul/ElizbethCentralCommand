import { NextResponse } from "next/server";

import { listLedgerEntriesByCoffee } from "~/server/db/coffeeQueries";
import type { BrewLedgerPage } from "~/types/coffee";

function parseCoffeeId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const [brewedAtValue, idValue] = value.split("|");
  if (!brewedAtValue || !idValue) return "invalid";
  const brewedAt = new Date(brewedAtValue);
  const id = Number.parseInt(idValue, 10);
  if (Number.isNaN(brewedAt.getTime()) || !Number.isFinite(id)) return "invalid";
  return { brewedAt, id };
}

function parseSortParam(value: string | null) {
  if (value == null || value === "") return "desc" as const;
  return value === "asc" || value === "desc" ? value : "invalid";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ coffeeId: string }> },
) {
  const { coffeeId: coffeeIdParam } = await params;
  const coffeeId = parseCoffeeId(coffeeIdParam);
  if (coffeeId == null) {
    return NextResponse.json({ error: "Invalid coffee id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const cursor = parseCursor(url.searchParams.get("cursor"));
  if (cursor === "invalid") {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const from = parseDateParam(url.searchParams.get("from"));
  if (from === "invalid") {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }

  const to = parseDateParam(url.searchParams.get("to"));
  if (to === "invalid") {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }

  const sort = parseSortParam(url.searchParams.get("sort"));
  if (sort === "invalid") {
    return NextResponse.json({ error: "Invalid sort" }, { status: 400 });
  }

  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : 5;
  if (!Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const page = await listLedgerEntriesByCoffee(coffeeId, {
    limit,
    cursor,
    from,
    to,
    sort,
  });

  const response: BrewLedgerPage = {
    entries: page.entries,
    nextCursor: page.nextCursor
      ? `${page.nextCursor.brewedAt}|${page.nextCursor.id}`
      : null,
  };

  return NextResponse.json(response);
}
