// src/lib/drafts.ts
"use client";
import type { AllSteps } from "@/lib/schema";

export type DraftItem = {
  id: string;
  owner: string;
  data: AllSteps;
  updatedAt: number;
  pk?: string;
  sk?: string;
  status?: string;
};

export async function saveDraft(draftId: string | null, data: AllSteps) {
  const res = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, data }),
  });

  const j: { ok?: boolean; id?: string; updatedAt?: number; error?: string } =
    await res.json().catch(() => ({}));

  if (!res.ok || !j.ok || !j.id) {
    throw new Error(j.error || `Save failed (${res.status})`);
  }
  return { ok: true as const, id: j.id, updatedAt: j.updatedAt ?? Date.now() };
}

export async function loadDraft(draftId: string) {
  const res = await fetch(`/api/db/load?draftId=${encodeURIComponent(draftId)}`);
  const j: { ok?: boolean; item?: DraftItem | null; error?: string } =
    await res.json().catch(() => ({}));

  if (!res.ok || j.ok === false) {
    throw new Error(j.error || `Load failed (${res.status})`);
  }
  return { ok: true as const, item: j.item ?? null };
}