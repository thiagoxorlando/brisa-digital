import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import ClientPresentation from "@/features/presentation/ClientPresentation";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const supabase  = createServerClient({ useServiceRole: true });
  const { data }  = await supabase
    .from("workspace_presentations")
    .select("title")
    .eq("token", token)
    .single();
  return { title: data?.title ?? "Apresentação de talentos — CastAnet" };
}

export default async function PresentationPage({ params }: Props) {
  const { token } = await params;
  return <ClientPresentation token={token} />;
}
