import { NextResponse } from "next/server";

import { createRecipe } from "~/server/db/coffeeQueries";
import { recipeCreateSchema } from "~/types/coffee";

export async function POST(request: Request) {
  const payload: unknown = await request.json();
  const parsed = recipeCreateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const recipe = await createRecipe(parsed.data);
  return NextResponse.json(recipe, { status: 201 });
}
