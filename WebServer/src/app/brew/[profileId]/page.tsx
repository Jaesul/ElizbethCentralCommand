import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrewLegacyProfileRedirect({ params, searchParams }: PageProps) {
  const { profileId } = await params;
  const sp = await searchParams;
  const next = new URLSearchParams();
  next.set("profileId", profileId);
  for (const key of ["coffeeId", "recipeId", "ledgerEntryId"] as const) {
    const v = sp[key];
    if (typeof v === "string") next.set(key, v);
  }
  redirect(`/brew?${next.toString()}`);
}
