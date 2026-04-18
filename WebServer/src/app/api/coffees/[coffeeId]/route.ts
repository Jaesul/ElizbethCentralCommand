import { NextResponse } from "next/server";

import {
  getCoffeePageDetailById,
  updateCoffee,
} from "~/server/db/coffeeQueries";
import { coffeeUpdateSchema } from "~/types/coffee";

function parseCoffeeId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ coffeeId: string }> },
) {
  const { coffeeId: coffeeIdParam } = await params;
  const coffeeId = parseCoffeeId(coffeeIdParam);
  if (coffeeId == null) {
    return NextResponse.json({ error: "Invalid coffee id" }, { status: 400 });
  }

  const coffee = await getCoffeePageDetailById(coffeeId);
  if (!coffee) {
    return NextResponse.json({ error: "Coffee not found" }, { status: 404 });
  }

  return NextResponse.json(coffee);
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
  const parsed = coffeeUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const coffee = await updateCoffee(coffeeId, parsed.data);
  if (!coffee) {
    return NextResponse.json({ error: "Coffee not found" }, { status: 404 });
  }

  return NextResponse.json(coffee);
}
