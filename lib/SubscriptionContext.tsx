"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { PLAN_DEFINITIONS, PLAN_DEFAULT } from "@/lib/plans";

type SubscriptionContextValue = {
  plan:              string;
  isActive:          boolean;
  isPro:             boolean;
  isPremium:         boolean;
  commissionLabel:   string;
  talentShareLabel:  string;
  maxActiveJobs:     number | null;
  maxHiresPerJob:    number | null;
  refreshPlan:       () => Promise<void>;
};

const FREE = PLAN_DEFINITIONS[PLAN_DEFAULT];

const SubscriptionContext = createContext<SubscriptionContextValue>({
  plan:             PLAN_DEFAULT,
  isActive:         false,
  isPro:            false,
  isPremium:        false,
  commissionLabel:  FREE.commissionLabel,
  talentShareLabel: `${Math.round((1 - FREE.commissionRate) * 100)}%`,
  maxActiveJobs:    FREE.maxActiveJobs,
  maxHiresPerJob:   FREE.maxHiresPerJob,
  refreshPlan:      async () => {},
});

export function SubscriptionProvider({
  initialPlan,
  initialIsActive,
  initialIsPro,
  children,
}: {
  initialPlan:      string;
  initialIsActive:  boolean;
  initialIsPro:     boolean;
  children:         React.ReactNode;
}) {
  const initDef = PLAN_DEFINITIONS[initialPlan as keyof typeof PLAN_DEFINITIONS] ?? PLAN_DEFINITIONS[PLAN_DEFAULT];

  const [plan,             setPlan]             = useState(initialPlan);
  const [isActive,         setIsActive]         = useState(initialIsActive);
  const [isPro,            setIsPro]            = useState(initialIsPro);
  const [isPremium,        setIsPremium]        = useState(initialPlan === "premium");
  const [commissionLabel,  setCommissionLabel]  = useState(initDef.commissionLabel);
  const [talentShareLabel, setTalentShareLabel] = useState(`${Math.round((1 - initDef.commissionRate) * 100)}%`);
  const [maxActiveJobs,    setMaxActiveJobs]    = useState<number | null>(initDef.maxActiveJobs);
  const [maxHiresPerJob,   setMaxHiresPerJob]   = useState<number | null>(initDef.maxHiresPerJob);

  const refreshPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/plan");
      if (!res.ok) return;
      const data = await res.json();
      const p = data.plan ?? PLAN_DEFAULT;
      setPlan(p);
      setIsActive(data.is_active ?? false);
      setIsPro(data.is_pro ?? false);
      setIsPremium(data.is_premium ?? false);
      setCommissionLabel(data.commission_label   ?? PLAN_DEFINITIONS[PLAN_DEFAULT].commissionLabel);
      setTalentShareLabel(data.talent_share_label ?? `${Math.round((1 - PLAN_DEFINITIONS[PLAN_DEFAULT].commissionRate) * 100)}%`);
      setMaxActiveJobs(data.max_active_jobs   ?? PLAN_DEFINITIONS[PLAN_DEFAULT].maxActiveJobs);
      setMaxHiresPerJob(data.max_hires_per_job ?? PLAN_DEFINITIONS[PLAN_DEFAULT].maxHiresPerJob);
      console.log("[subscription] plan refreshed:", p);
    } catch (err) {
      console.warn("[subscription] refreshPlan failed:", err);
    }
  }, []);

  useEffect(() => { refreshPlan(); }, [refreshPlan]);

  return (
    <SubscriptionContext.Provider value={{
      plan,
      isActive,
      isPro,
      isPremium,
      commissionLabel,
      talentShareLabel,
      maxActiveJobs,
      maxHiresPerJob,
      refreshPlan,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
