import { NextResponse } from "next/server";

import { createLedgerEntry } from "~/server/db/coffeeQueries";
import { ledgerCreateSchema } from "~/types/coffee";

export async function POST(request: Request) {
  const payload: unknown = await request.json();
  const parsed = ledgerCreateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const entry = await createLedgerEntry(parsed.data);
  return NextResponse.json(entry, { status: 201 });
}
