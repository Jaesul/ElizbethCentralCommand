import { NextResponse } from "next/server";

import {
  createCoffee,
  listCoffees,
} from "~/server/db/coffeeQueries";
import { coffeeCreateSchema, coffeeListQuerySchema } from "~/types/coffee";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = coffeeListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    minRecipes: url.searchParams.get("minRecipes") ?? undefined,
    maxRecipes: url.searchParams.get("maxRecipes") ?? undefined,
    minBrews: url.searchParams.get("minBrews") ?? undefined,
    maxBrews: url.searchParams.get("maxBrews") ?? undefined,
    minBagsConsumed: url.searchParams.get("minBagsConsumed") ?? undefined,
    maxBagsConsumed: url.searchParams.get("maxBagsConsumed") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const coffees = await listCoffees(parsed.data);
  return NextResponse.json(coffees);
}

export async function POST(request: Request) {
  const payload: unknown = await request.json();
  const parsed = coffeeCreateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const coffee = await createCoffee(parsed.data);
  return NextResponse.json(coffee, { status: 201 });
}
