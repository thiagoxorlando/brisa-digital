import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { createSessionClient } from "@/lib/supabase.server";
import TalentProfileEdit from "@/features/talent/TalentProfileEdit";

export const metadata: Metadata = { title: "Profile — BrisaHub" };

type Props = { params: Promise<{ workspaceSlug: string }> };

export default async function WorkspaceProfilePage({ params }: Props) {
  const { workspaceSlug } = await params;

  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();

  const supabase = createServerClient({ useServiceRole: true });

  const { data: workspace } = await supabase
    .from("premium_workspaces")
    .select("name, logo_url, brand_primary_color, brand_accent_color")
    .eq("slug", workspaceSlug)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!workspace) notFound();

  const primary = (workspace.brand_primary_color as string | null) ?? "#1ABC9C";
  const accent  = (workspace.brand_accent_color  as string | null) ?? "#27C1D6";

  return (
    <div className="space-y-6">
      {/* Branded context card */}
      <div
        className="flex items-start gap-4 overflow-hidden rounded-[20px] border border-zinc-200 p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]"
        style={{ background: `linear-gradient(135deg, ${primary}0d, ${accent}06)` }}
      >
        <div className="flex-shrink-0">
          {workspace.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.logo_url as string}
              alt={workspace.name as string}
              className="h-11 w-11 rounded-xl border border-white/60 object-cover shadow"
            />
          ) : (
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-base font-bold text-white shadow"
              style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
            >
              {(workspace.name as string).slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
            Portal Premium · {workspace.name as string}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-700">
            Este perfil é usado nas suas candidaturas para{" "}
            <span className="font-semibold">{workspace.name as string}</span>.
            Mantenha-o atualizado para aumentar suas chances de seleção.
          </p>
        </div>
      </div>

      <TalentProfileEdit />
    </div>
  );
}
