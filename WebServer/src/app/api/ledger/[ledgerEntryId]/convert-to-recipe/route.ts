import { NextResponse } from "next/server";

import { convertLedgerEntryToRecipe } from "~/server/db/coffeeQueries";
import { convertLedgerToRecipeSchema } from "~/types/coffee";

function parseLedgerId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ledgerEntryId: string }> },
) {
  const { ledgerEntryId: ledgerIdParam } = await params;
  const ledgerEntryId = parseLedgerId(ledgerIdParam);
  if (ledgerEntryId == null) {
    return NextResponse.json(
      { error: "Invalid ledger entry id" },
      { status: 400 },
    );
  }

  const payload: unknown = await request.json().catch(() => ({}));
  const parsed = convertLedgerToRecipeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const recipe = await convertLedgerEntryToRecipe(
    ledgerEntryId,
    parsed.data.name,
  );

  if (!recipe) {
    return NextResponse.json(
      { error: "Ledger entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(recipe, { status: 201 });
}
