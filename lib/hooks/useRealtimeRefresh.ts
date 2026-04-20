"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type RealtimeSub = {
  table: string;
  /** Supabase filter expression, e.g. "agency_id=eq.abc123". Omit to rely on RLS. */
  filter?: string;
};

/**
 * Subscribes to postgres_changes on the given tables and calls onRefresh
 * whenever any matching row is inserted, updated, or deleted.
 *
 * - Debounces 300 ms so bursts (e.g. booking + contract updated together)
 *   produce a single refresh call.
 * - Returns { refreshing } which is true for ~1.5 s after each refresh,
 *   useful for showing a subtle "Atualizando…" indicator.
 * - Cleans up the Supabase channel on component unmount.
 */
export function useRealtimeRefresh(
  subscriptions: RealtimeSub[],
  onRefresh: () => void,
): { refreshing: boolean } {
  const [refreshing, setRefreshing] = useState(false);

  // Always call the latest version of onRefresh without re-subscribing
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; });

  // Capture subscriptions at mount time — they don't change
  const subsRef = useRef(subscriptions);

  // Debounce timer
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!subsRef.current.length) return;

    const channelName = `rt-${subsRef.current.map((s) => s.table).join("-")}-${Math.random().toString(36).slice(2, 8)}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = supabase.channel(channelName);

    for (const sub of subsRef.current) {
      const config: Record<string, unknown> = { event: "*", schema: "public", table: sub.table };
      if (sub.filter) config.filter = sub.filter;
      channel = channel.on("postgres_changes", config, () => {
        // Debounce: wait 300ms after last event, then refresh once
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (clearRef.current) clearTimeout(clearRef.current);
        setRefreshing(true);
        debounceRef.current = setTimeout(() => {
          onRefreshRef.current();
          clearRef.current = setTimeout(() => setRefreshing(false), 1500);
        }, 300);
      });
    }

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (clearRef.current) clearTimeout(clearRef.current);
      void supabase.removeChannel(channel);
    };
  }, []); // mount/unmount only — subscriptions are stable via ref

  return { refreshing };
}
