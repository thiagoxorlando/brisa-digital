"use client";

import { useState, useCallback } from "react";

export type PlatformSettings = {
  platform_name: string;
  support_email: string | null;
  new_agency_signup_enabled: boolean;
  new_talent_signup_enabled: boolean;
  referrals_enabled: boolean;
  public_job_sharing_enabled: boolean;
  premium_plan_enabled: boolean;
  automatic_pix_withdrawals_enabled: boolean;
  minimum_withdrawal_amount: number;
  automatic_withdrawal_limit: number;
  max_withdrawals_per_day: number;
  maintenance_mode_enabled: boolean;
  require_terms_acceptance: boolean;
  /** PIX withdrawal fee as a percentage (e.g. 2 = 2%). 0 = no fee. */
  withdrawal_fee_percent: number;
  /** Minimum fixed withdrawal fee in BRL. Applied only when > 0. */
  withdrawal_min_fee: number;
  /** Minimum withdrawal amount for agencies in BRL. */
  withdrawal_min_amount_agency: number;
  /** Days after contract is paid before talent can withdraw. 0 = immediate. */
  payout_delay_days: number;
  /** Days before an unconfirmed escrow contract is auto-cancelled. 0 = no timeout. */
  escrow_timeout_days: number;
  /** Maximum contract/signed-document upload size in MB. */
  upload_max_mb: number;
  /** Global default payment mode for agencies with no per-agency override. */
  default_payment_mode: "internal" | "escrow";
  /** Global default commission percent (fallback when plan commission unavailable). */
  default_commission_percent: number;
  /** Global default: whether escrow is enabled for escrow-mode agencies. */
  default_escrow_enabled: boolean;
  /** Global default: whether receipt upload is required in internal mode. */
  default_receipt_upload_required: boolean;
  /** Enable trial for new PRO subscriptions. */
  trials_enabled: boolean;
  /** Auto-charge card when trial ends (Asaas deferred billing). */
  trial_auto_charge_enabled: boolean;
  /** Trial duration in days for new PRO subscriptions. */
  trial_duration_days: number;
  /** Show launch checklist on agency dashboard. */
  show_onboarding_checklist: boolean;
  /** Show feature guide cards on agency pages. */
  show_feature_guide_cards: boolean;
  /** Days after agency_payment_sent_at before contract auto-confirms in internal mode. 0 = disabled. */
  internal_payment_auto_confirm_days: number;
};

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-[#1ABC9C]" : "bg-zinc-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-zinc-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[#1F2D2E]">{label}</p>
        {description && <p className="text-[12px] text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#647B7B] mb-2">{title}</h2>
      <div className="divide-y divide-zinc-50">{children}</div>
    </div>
  );
}

export default function AdminSettings({ initialSettings }: { initialSettings: PlatformSettings }) {
  const [settings, setSettings] = useState<PlatformSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const update = useCallback(<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar.");
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {settings.maintenance_mode_enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-[13px] font-semibold text-amber-800">
            ⚠ Modo de manutenção está ATIVO. Usuários podem estar vendo mensagens de indisponibilidade.
          </p>
        </div>
      )}

      <Section title="Geral">
        <SettingRow label="Nome da plataforma" description="Exibido em e-mails e interface">
          <input
            type="text"
            value={settings.platform_name}
            onChange={(e) => update("platform_name", e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-48"
          />
        </SettingRow>
        <SettingRow label="Email de suporte" description="Email exibido para suporte ao usuário">
          <input
            type="email"
            value={settings.support_email ?? ""}
            onChange={(e) => update("support_email", e.target.value || null)}
            placeholder="suporte@example.com"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-48"
          />
        </SettingRow>
      </Section>

      <Section title="Cadastros">
        <SettingRow label="Cadastro de agências" description="Permite que novas agências criem conta">
          <Toggle checked={settings.new_agency_signup_enabled} onChange={(v) => update("new_agency_signup_enabled", v)} />
        </SettingRow>
        <SettingRow label="Cadastro de talentos" description="Permite que novos talentos criem conta">
          <Toggle checked={settings.new_talent_signup_enabled} onChange={(v) => update("new_talent_signup_enabled", v)} />
        </SettingRow>
      </Section>

      <Section title="Financeiro">
        <SettingRow label="Valor mínimo de saque" description="Valor mínimo em reais para solicitar saque">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.minimum_withdrawal_amount}
              onChange={(e) => update("minimum_withdrawal_amount", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
          </div>
        </SettingRow>
        <SettingRow label="Limite para saque automático" description="Valor máximo para aprovação automática (0 = desativado)">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.automatic_withdrawal_limit}
              onChange={(e) => update("automatic_withdrawal_limit", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
          </div>
        </SettingRow>
        <SettingRow label="Máximo de saques por dia" description="Por usuário">
          <input
            type="number"
            min={0}
            step={1}
            value={settings.max_withdrawals_per_day}
            onChange={(e) => update("max_withdrawals_per_day", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
        <SettingRow label="Saques PIX automáticos" description="Habilita processamento automático de saques via PIX">
          <Toggle checked={settings.automatic_pix_withdrawals_enabled} onChange={(v) => update("automatic_pix_withdrawals_enabled", v)} />
        </SettingRow>
      </Section>

      <Section title="Pagamentos da plataforma">
        <SettingRow
          label="Modo de pagamento padrão"
          description="Padrão global para agências sem override individual. internal = agência paga externamente; escrow = custódia BrisaHub."
        >
          <select
            value={settings.default_payment_mode}
            onChange={(e) => update("default_payment_mode", e.target.value as "internal" | "escrow")}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-48"
          >
            <option value="internal">Internal (pagamento externo)</option>
            <option value="escrow">Escrow (custódia BrisaHub)</option>
          </select>
        </SettingRow>
        <SettingRow
          label="Comissão padrão (%)"
          description="Comissão global quando o plano não define uma taxa (0 = sem comissão)"
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={settings.default_commission_percent}
              onChange={(e) => update("default_commission_percent", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
            <span className="text-[12px] text-zinc-500">%</span>
          </div>
        </SettingRow>
        <SettingRow
          label="Custódia habilitada por padrão"
          description="Para agências em modo escrow sem override, habilita a custódia BrisaHub automaticamente"
        >
          <Toggle checked={settings.default_escrow_enabled} onChange={(v) => update("default_escrow_enabled", v)} />
        </SettingRow>
        <SettingRow
          label="Upload de comprovante obrigatório por padrão"
          description="Para agências em modo internal sem override, exige upload de comprovante de pagamento"
        >
          <Toggle checked={settings.default_receipt_upload_required} onChange={(v) => update("default_receipt_upload_required", v)} />
        </SettingRow>
      </Section>

      <Section title="Taxas e prazos">
        <SettingRow label="Taxa de saque de agência (%)" description="Percentual cobrado sobre o valor do saque PIX (0 = sem taxa)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={settings.withdrawal_fee_percent}
              onChange={(e) => update("withdrawal_fee_percent", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
            <span className="text-[12px] text-zinc-500">%</span>
          </div>
        </SettingRow>
        <SettingRow label="Taxa mínima de saque de agência (R$)" description="Valor mínimo cobrado por saque em reais (0 = sem mínimo)">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.withdrawal_min_fee}
              onChange={(e) => update("withdrawal_min_fee", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
          </div>
        </SettingRow>
        <SettingRow label="Saque mínimo para agências (R$)" description="Valor mínimo permitido por solicitação de saque de agências">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.withdrawal_min_amount_agency}
              onChange={(e) => update("withdrawal_min_amount_agency", Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
            />
          </div>
        </SettingRow>
        <SettingRow label="Prazo de liberação (dias)" description="Dias após pagamento do contrato antes do talento poder sacar (0 = imediato)">
          <input
            type="number"
            min={0}
            step={1}
            value={settings.payout_delay_days}
            onChange={(e) => update("payout_delay_days", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
        <SettingRow label="Timeout de custódia (dias)" description="Dias antes de cancelar contrato confirmado sem pagamento (0 = sem timeout)">
          <input
            type="number"
            min={0}
            step={1}
            value={settings.escrow_timeout_days}
            onChange={(e) => update("escrow_timeout_days", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
        <SettingRow label="Tamanho máximo de upload (MB)" description="Limite para upload de contratos PDF (ex: 20)">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={settings.upload_max_mb}
            onChange={(e) => update("upload_max_mb", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
      </Section>

      <Section title="Recursos">
        <SettingRow label="Sistema de indicações" description="Habilita o programa de indicações entre usuários">
          <Toggle checked={settings.referrals_enabled} onChange={(v) => update("referrals_enabled", v)} />
        </SettingRow>
        <SettingRow label="Compartilhamento público de vagas" description="Permite compartilhar vagas via link público">
          <Toggle checked={settings.public_job_sharing_enabled} onChange={(v) => update("public_job_sharing_enabled", v)} />
        </SettingRow>
        <SettingRow label="Plano Premium" description="Habilita o plano Premium (informativo — use plan_settings para disponibilidade real)">
          <Toggle checked={settings.premium_plan_enabled} onChange={(v) => update("premium_plan_enabled", v)} />
        </SettingRow>
      </Section>

      <Section title="Trial e assinatura">
        <SettingRow label="Trial habilitado" description="Novas assinaturas PRO recebem trial gratuito antes da primeira cobrança quando o checkout transparente estiver ativo.">
          <Toggle checked={settings.trials_enabled} onChange={(v) => update("trials_enabled", v)} />
        </SettingRow>
        <SettingRow label="Cobrança automática no fim do trial" description="Valida o cartão no início e agenda a primeira cobrança para o fim do trial usando a assinatura recorrente do Asaas.">
          <Toggle checked={settings.trial_auto_charge_enabled} onChange={(v) => update("trial_auto_charge_enabled", v)} />
        </SettingRow>
        <SettingRow label="Duração do trial (dias)" description="Dias de trial concedidos ao iniciar uma assinatura PRO.">
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={settings.trial_duration_days}
            onChange={(e) => update("trial_duration_days", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
        <SettingRow label="Auto-confirmação pagamento interno (dias)" description="Dias após agency_payment_sent_at antes do contrato ser confirmado automaticamente (0 = desativado)">
          <input
            type="number"
            min={0}
            max={90}
            step={1}
            value={settings.internal_payment_auto_confirm_days}
            onChange={(e) => update("internal_payment_auto_confirm_days", Number(e.target.value))}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-800 focus:border-zinc-400 focus:outline-none w-24"
          />
        </SettingRow>
      </Section>

      <Section title="Onboarding">
        <SettingRow label="Checklist de lançamento" description="Exibe o checklist de primeiros passos no painel da agência">
          <Toggle checked={settings.show_onboarding_checklist} onChange={(v) => update("show_onboarding_checklist", v)} />
        </SettingRow>
        <SettingRow label="Cards de guia de recursos" description="Exibe cards contextuais de ajuda nas páginas da agência">
          <Toggle checked={settings.show_feature_guide_cards} onChange={(v) => update("show_feature_guide_cards", v)} />
        </SettingRow>
      </Section>

      <Section title="Segurança">
        <SettingRow label="Modo de manutenção" description="Exibe aviso de manutenção para admins. Não bloqueia o app globalmente nesta fase.">
          <Toggle checked={settings.maintenance_mode_enabled} onChange={(v) => update("maintenance_mode_enabled", v)} />
        </SettingRow>
        <SettingRow label="Exigir aceite dos termos" description="Bloqueia cadastro sem aceite dos termos de uso">
          <Toggle checked={settings.require_terms_acceptance} onChange={(v) => update("require_terms_acceptance", v)} />
        </SettingRow>
      </Section>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-xl bg-[#1F2D2E] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#2d3f40] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
        {saved && !dirty && (
          <span className="text-[13px] text-emerald-600 font-medium">Configurações salvas.</span>
        )}
        {error && <span className="text-[13px] text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
