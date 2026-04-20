import { supabase } from "./supabase";

export type UserRole = "agency" | "talent" | "admin";

export async function getUserRole(): Promise<UserRole | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return null; // expired/invalid session — onAuthStateChange will redirect

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("getUserRole error:", error.message);
    return null;
  }

  return (data?.role as UserRole) ?? null;
}
