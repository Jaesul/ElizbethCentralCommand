import { NextResponse } from "next/server";

import {
  getLedgerEntryById,
  updateLedgerEntry,
} from "~/server/db/coffeeQueries";
import { ledgerUpdateSchema } from "~/types/coffee";

function parseLedgerId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(
  _request: Request,
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

  const entry = await getLedgerEntryById(ledgerEntryId);
  if (!entry) {
    return NextResponse.json(
      { error: "Ledger entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(entry);
}

export async function PATCH(
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

  const payload: unknown = await request.json();
  const parsed = ledgerUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const entry = await updateLedgerEntry(ledgerEntryId, parsed.data);
  if (!entry) {
    return NextResponse.json(
      { error: "Ledger entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(entry);
}
