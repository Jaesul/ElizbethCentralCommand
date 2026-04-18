import { NextResponse } from "next/server";

import {
  finishCoffeeBag,
  openCoffeeBag,
} from "~/server/db/coffeeQueries";
import {
  finishCoffeeBagSchema,
  openCoffeeBagSchema,
} from "~/types/coffee";

function parseCoffeeId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ coffeeId: string }> },
) {
  const { coffeeId: coffeeIdParam } = await params;
  const coffeeId = parseCoffeeId(coffeeIdParam);
  if (coffeeId == null) {
    return NextResponse.json({ error: "Invalid coffee id" }, { status: 400 });
  }

  const payload: unknown = await request.json();
  const parsed = finishCoffeeBagSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const coffee = await finishCoffeeBag(coffeeId, parsed.data);
    if (!coffee) {
      return NextResponse.json({ error: "Coffee not found" }, { status: 404 });
    }

    return NextResponse.json(coffee);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to finish coffee bag";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ coffeeId: string }> },
) {
  const { coffeeId: coffeeIdParam } = await params;
  const coffeeId = parseCoffeeId(coffeeIdParam);
  if (coffeeId == null) {
    return NextResponse.json({ error: "Invalid coffee id" }, { status: 400 });
  }

  const payload: unknown = await request.json();
  const parsed = openCoffeeBagSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const coffee = await openCoffeeBag(coffeeId, parsed.data);
    if (!coffee) {
      return NextResponse.json({ error: "Coffee not found" }, { status: 404 });
    }

    return NextResponse.json(coffee);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to open a new coffee bag";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
