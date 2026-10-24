"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminContent } from "@/lib/admin-content";
import { ContentManager } from "@/components/admin/content-manager";

const CACHE_LIFETIME_MS = 50 * 60 * 1000;
const inFlightLoads = new Map<string, Promise<AdminContent>>();

type CacheEntry = { savedAt: number; content: AdminContent };

function cacheKey(userId: string, sessionId: string) {
  return `ilyc-admin-content:${userId}:${sessionId}`;
}

function readCachedContent(userId: string, sessionId: string): AdminContent | null {
  try {
    const value = sessionStorage.getItem(cacheKey(userId, sessionId));
    if (!value) return null;
    const entry = JSON.parse(value) as CacheEntry;
    if (!entry.content || Date.now() - entry.savedAt > CACHE_LIFETIME_MS) {
      sessionStorage.removeItem(cacheKey(userId, sessionId));
      return null;
    }
    return entry.content;
  } catch {
    return null;
  }
}

function writeCachedContent(userId: string, sessionId: string, content: AdminContent) {
  const serialized = JSON.stringify(content);
  if (serialized.includes("blob:")) return;
  try {
    sessionStorage.setItem(cacheKey(userId, sessionId), JSON.stringify({ savedAt: Date.now(), content } satisfies CacheEntry));
  } catch {
    // Storage can be unavailable or full; the panel still works without the cache.
  }
}

function loadContent(userId: string, sessionId: string): Promise<AdminContent> {
  const key = cacheKey(userId, sessionId);
  const current = inFlightLoads.get(key);
  if (current) return current;

  const request = fetch("/api/admin/content", { cache: "no-store" })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar o conteúdo.");
      return result as AdminContent;
    })
    .then((result) => {
      writeCachedContent(userId, sessionId, result);
      return result;
    })
    .finally(() => { inFlightLoads.delete(key); });
  inFlightLoads.set(key, request);
  return request;
}

export function AdminContentLoader({ userId, sessionId }: { userId: string; sessionId: string }) {
  const [content, setContent] = useState<AdminContent | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedContent(userId, sessionId);
    if (cached) {
      queueMicrotask(() => {
        if (!cancelled) {
          setContent(cached);
          setError("");
        }
      });
      return () => { cancelled = true; };
    }
    loadContent(userId, sessionId)
      .then((result) => {
        if (cancelled) return;
        setContent(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o conteúdo.");
      });
    return () => { cancelled = true; };
  }, [attempt, sessionId, userId]);

  const refreshSavedContent = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      if (!response.ok) return;
      const savedContent = await response.json() as AdminContent;
      writeCachedContent(userId, sessionId, savedContent);
    } catch {
      // Keep the current cache if a post-save refresh is temporarily unavailable.
    }
  }, [sessionId, userId]);

  if (error) return <div className="admin-inline-error" role="alert">{error}<button className="button button-outline" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button></div>;
  if (!content) return <div className="admin-content-loading" role="status"><span className="preview-live-dot" />Carregando conteúdo do painel…</div>;
  return <ContentManager initialContent={content} onContentSaved={() => { void refreshSavedContent(); }} />;
}
