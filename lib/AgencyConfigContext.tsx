"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AgencyConfig } from "@/lib/agencyConfig";
import { defaultEscrowConfig } from "@/lib/agencyConfig";

const DEFAULT_CONFIG: AgencyConfig = defaultEscrowConfig(20);

const AgencyConfigContext = createContext<AgencyConfig>(DEFAULT_CONFIG);

export function AgencyConfigProvider({
  initial,
  children,
}: {
  initial?: AgencyConfig;
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<AgencyConfig>(initial ?? DEFAULT_CONFIG);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/config");
      if (!res.ok) return;
      const data = (await res.json()) as AgencyConfig;
      setConfig(data);
    } catch {
      // keep default
    }
  }, []);

  useEffect(() => {
    if (!initial) fetchConfig();
  }, [initial, fetchConfig]);

  return (
    <AgencyConfigContext.Provider value={config}>
      {children}
    </AgencyConfigContext.Provider>
  );
}

export function useAgencyConfig(): AgencyConfig {
  return useContext(AgencyConfigContext);
}
