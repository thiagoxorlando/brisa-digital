"use client";

import { createContext, useContext } from "react";

type SubscriptionContextValue = {
  isActive: boolean;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({ isActive: true });

export function SubscriptionProvider({
  isActive,
  children,
}: {
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <SubscriptionContext.Provider value={{ isActive }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext);
}
