import { NextResponse } from "next/server";

import {
  createCoffee,
  listCoffees,
} from "~/server/db/coffeeQueries";
import { coffeeCreateSchema } from "~/types/coffee";

export async function GET() {
  const coffees = await listCoffees();
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
