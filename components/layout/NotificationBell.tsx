"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NotifType =
  | "contract"
  | "booking"
  | "payment"
  | "new_job"
  | string;

type Notification = {
  id: string;
  type: NotifType;
  message: string;
  is_read: boolean;
  created_at: string;
  link: string | null;
};

function formatTime(s: string) {
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TypeIcon({ type }: { type: NotifType }) {
  const base = "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0";

  if (type === "contract") {
    return (
      <div className={`${base} bg-violet-50`}>
        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    );
  }
  if (type === "booking") {
    return (
      <div className={`${base} bg-emerald-50`}>
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (type === "payment") {
    return (
      <div className={`${base} bg-emerald-50`}>
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  if (type === "new_job") {
    return (
      <div className={`${base} bg-amber-50`}>
        <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`${base} bg-zinc-100`}>
      <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </div>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function fetchNotifications(userId: string) {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, message, is_read, created_at, link")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      fetchNotifications(user.id);

      // Real-time: push new notifications instantly
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setItems((prev) => [payload.new as Notification, ...prev]);
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = items.filter((n) => !n.is_read).length;

  async function handleClick(n: Notification) {
    // Mark as read
    if (!n.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", n.id);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
    }
    // Navigate if there's a link
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] bg-rose-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-[340px] bg-white rounded-2xl border border-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.10)] z-50 overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-zinc-900">Notifications</p>
              {unread > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="w-9 h-9 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-zinc-500">No notifications yet</p>
              <p className="text-[12px] text-zinc-400 mt-0.5">You're all caught up.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-zinc-50">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={[
                    "flex items-start gap-3 px-4 py-3 transition-colors",
                    n.link || !n.is_read ? "cursor-pointer hover:bg-zinc-50/80" : "",
                    n.is_read ? "bg-white" : "bg-zinc-50/80",
                  ].join(" ")}
                >
                  <TypeIcon type={n.type} />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className={`text-[13px] leading-snug ${n.is_read ? "text-zinc-500" : "text-zinc-800 font-medium"}`}>
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-zinc-400">{formatTime(n.created_at)}</p>
                      {n.link && (
                        <span className="text-[10px] font-medium text-zinc-400 flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          view
                        </span>
                      )}
                    </div>
                  </div>
                  {!n.is_read && (
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
