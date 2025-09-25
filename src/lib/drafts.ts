// src/lib/drafts.ts
"use client";

import type { AllSteps } from "@/lib/schema";

// What the API may return
export type DraftItem = {
  id?: string;         // some routes return "id"
  draftId?: string;    // others may return "draftId"
  owner: string;
  data: AllSteps;
  updatedAt: number;
};

export async function saveDraft(currentId: string | null, data: AllSteps) {
  const res = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId: currentId ?? undefined, data }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Save failed with ${res.status}`);
  }
  // Standardize on { id }
  const j = (await res.json()) as { ok: true; id: string };
  return j;
}

export async function loadDraft(draftId: string) {
  const url = `/api/db/load?draftId=${encodeURIComponent(draftId)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Load failed with ${res.status}`);
  }
  return (await res.json()) as { ok: true; item?: DraftItem };
}