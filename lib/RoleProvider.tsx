"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getUserRole, type UserRole } from "./getUserRole";

type RoleContextValue = {
  role: UserRole | null;
  loading: boolean;
};

const RoleContext = createContext<RoleContextValue>({ role: null, loading: true });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole]       = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserRole().then((r) => {
      setRole(r);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Redirect to login when the session token becomes invalid
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        const path = window.location.pathname;
        const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/onboarding");
        if (!isPublic) window.location.href = "/login";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <RoleContext.Provider value={{ role, loading }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
