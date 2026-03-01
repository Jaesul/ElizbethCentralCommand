"use client";

import { use } from "react";
import { ProfileBrewPage } from "~/components/ProfileBrewPage";

export default function BrewProfileRoutePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = use(params);
  return <ProfileBrewPage profileId={profileId} />;
}
