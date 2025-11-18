"use client";

import { ProfileEditorPage } from "~/components/ProfileEditorPage";

export default function EditProfilePage({ params }: { params: { id: string } }) {
  return <ProfileEditorPage profileId={params.id} />;
}

