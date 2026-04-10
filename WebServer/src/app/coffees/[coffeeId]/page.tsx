"use client";

import { use } from "react";

import { CoffeeHomePage } from "~/components/CoffeeHomePage";

export default function CoffeeRoutePage({
  params,
}: {
  params: Promise<{ coffeeId: string }>;
}) {
  const { coffeeId } = use(params);
  return <CoffeeHomePage coffeeId={Number.parseInt(coffeeId, 10)} />;
}
