"use client";
import type { AllSteps } from "@/lib/schema";

export async function saveDraft(draftId: string | null, data: AllSteps) {
  const res = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId, data }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    throw new Error(j.error || `Save failed (${res.status})`);
  }
  return j as { ok: true; id: string; updatedAt: number };
}

export async function loadDraft(draftId: string) {
  const res = await fetch(`/api/db/load?draftId=${encodeURIComponent(draftId)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) {
    throw new Error(j.error || `Load failed (${res.status})`);
  }
  return j as { ok: true; item: any | null };
}