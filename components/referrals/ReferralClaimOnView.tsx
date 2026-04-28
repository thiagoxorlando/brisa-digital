"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ReferralClaimOnView({ token }: { token: string }) {
  useEffect(() => {
    let active = true;

    async function linkReferralIfLoggedIn() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user?.id) return;

      await fetch("/api/referrals/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, user_id: user.id }),
      }).catch((error) => {
        console.error("[referral] link on view failed", error);
      });
    }

    void linkReferralIfLoggedIn();

    return () => {
      active = false;
    };
  }, [token]);

  return null;
}
