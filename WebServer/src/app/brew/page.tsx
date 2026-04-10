"use client";

import { Suspense } from "react";
import { ProfileBrewPage } from "~/components/ProfileBrewPage";
import { Skeleton } from "~/components/ui/skeleton";

function BrewPageFallback() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
      <Skeleton className="mb-6 h-10 w-32" />
      <Skeleton className="h-[420px] w-full rounded-xl" />
    </div>
  );
}

export default function BrewPage() {
  return (
    <Suspense fallback={<BrewPageFallback />}>
      <ProfileBrewPage />
    </Suspense>
  );
}
