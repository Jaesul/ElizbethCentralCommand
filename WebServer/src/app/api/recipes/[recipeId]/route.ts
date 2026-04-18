import { NextResponse } from "next/server";

import {
  deleteRecipe,
  getRecipeById,
  updateRecipe,
} from "~/server/db/coffeeQueries";
import { recipeUpdateSchema } from "~/types/coffee";

function parseRecipeId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId: recipeIdParam } = await params;
  const recipeId = parseRecipeId(recipeIdParam);
  if (recipeId == null) {
    return NextResponse.json({ error: "Invalid recipe id" }, { status: 400 });
  }

  const recipe = await getRecipeById(recipeId);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  return NextResponse.json(recipe);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId: recipeIdParam } = await params;
  const recipeId = parseRecipeId(recipeIdParam);
  if (recipeId == null) {
    return NextResponse.json({ error: "Invalid recipe id" }, { status: 400 });
  }

  const payload: unknown = await request.json();
  const parsed = recipeUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const recipe = await updateRecipe(recipeId, parsed.data);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  return NextResponse.json(recipe);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId: recipeIdParam } = await params;
  const recipeId = parseRecipeId(recipeIdParam);
  if (recipeId == null) {
    return NextResponse.json({ error: "Invalid recipe id" }, { status: 400 });
  }

  const ok = await deleteRecipe(recipeId);
  if (!ok) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
