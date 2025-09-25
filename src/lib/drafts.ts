// src/lib/drafts.ts
"use client";

import type { AllSteps } from "@/lib/schema";

// Create or update a draft.
// If `id` is provided, the API will upsert that draft. If not, it will create a new one.
export async function saveDraft(id: string | null, data: AllSteps) {
  const payload: Record<string, unknown> = { data };
  if (id) payload.id = id;

  const res = await fetch("/api/db/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Save failed with ${res.status}`);
  }

  // API returns { ok: true, id, ... }
  return json as { ok: true; id: string; pk: string; sk: string; updatedAt: string };
}

// Load a draft by id (our load route expects POST with { id })
export async function loadDraft(id: string) {
  const res = await fetch("/api/db/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Load failed with ${res.status}`);
  }

  // API returns { ok: true, item }
  return json as {
    ok: true;
    item: {
      pk: string;
      sk: string;
      id: string;
      data: AllSteps;
      status?: string;
      updatedAt?: number;
    };
  };
}

// Optional: list all drafts for the current (temporary "ANON") user
export async function listDrafts() {
  const res = await fetch("/api/db/list", { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `List failed with ${res.status}`);
  }
  return json as {
    ok: true;
    items: Array<{
      pk: string;
      sk: string;
      id: string;
      status?: string;
      updatedAt?: number;
    }>;
  };
}