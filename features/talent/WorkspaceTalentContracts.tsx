"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CONTRACTS_BUCKET } from "@/lib/contractFiles";
import { brl } from "@/lib/brl";
import { formatJobLocation } from "@/lib/jobLocation";
import { getContractComputedState } from "@/lib/contractState";
import AbrirDisputaButton from "@/features/disputes/AbrirDisputaButton";

export type WorkspaceTalentContract = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  agencyName: string;
  jobDate: string | null;
  jobTime: string | null;
  location: string | null;
  jobDescription: string | null;
  paymentAmount: number;
  commissionAmount: number | null;
  netAmount: number | null;
  paymentMethod: string | null;
  additionalNotes: string | null;
  status: string;
  createdAt: string;
  signedAt: string | null;
  paidAt: string | null;
  contractFileUrl: string | null;
  signedContractUrl: string | null;
  isAgentJobBacked?: boolean;
  activeDisputeId: string | null;
};

type Props = {
  contracts: WorkspaceTalentContract[];
  workspaceName: string;
  workspaceSlug: string;
  primary: string;
  accent: string;
};

type ModalState =
  | { kind: "details"; contractId: string }
  | { kind: "sign"; contractId: string }
  | { kind: "reject"; contractId: string }
  | null;

const ACTIONABLE_STATUSES = new Set(["sent"]);
const ACTIVE_STATUSES = new Set(["signed", "confirmed"]);
const PAID_STATUSES = new Set(["paid"]);
const HISTORY_STATUSES = new Set(["rejected", "cancelled"]);

function fmtDate(value: string | null, locale = "pt-BR") {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function fmtJobDate(value: string | null, locale = "pt-BR") {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function mapStatus(status: string) {
  if (status === "awaiting_talent" || status === "pending_signature") return "sent";
  if (status === "accepted" || status === "escrowed") return "confirmed";
  if (status === "completed") return "paid";
  return status;
}

export default function WorkspaceTalentContracts({
  contracts: initialContracts,
  workspaceName,
  workspaceSlug,
  primary,
  accent,
}: Props) {
  const [contracts, setContracts] = useState(initialContracts);
  const [modal, setModal] = useState<ModalState>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const contractMap = useMemo(
    () => new Map(contracts.map((c) => [c.id, c])),
    [contracts],
  );

  const pending  = contracts.filter((c) => ACTIONABLE_STATUSES.has(mapStatus(c.status)));
  const active   = contracts.filter((c) => ACTIVE_STATUSES.has(mapStatus(c.status)));
  const paid     = contracts.filter((c) => PAID_STATUSES.has(mapStatus(c.status)));
  const history  = contracts.filter((c) => HISTORY_STATUSES.has(mapStatus(c.status)));

  const modalContract = modal ? (contractMap.get(modal.contractId) ?? null) : null;

  function openModal(kind: "details" | "sign" | "reject", contractId: string) {
    setSignedFile(null);
    setUploadError("");
    setError(null);
    setModal({ kind, contractId } as ModalState);
  }

  function closeModal() {
    setModal(null);
    setSignedFile(null);
    setUploadError("");
    setError(null);
  }

  async function handleSign(contract: WorkspaceTalentContract) {
    setActingId(contract.id);
    setError(null);

    let signedPath: string | undefined;

    if (signedFile) {
      setUploading(true);
      try {
        const signRes = await fetch("/api/contracts/upload-signed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contract_id: contract.id, filename: signedFile.name, filesize: signedFile.size }),
        });
        if (!signRes.ok) {
          const j = await signRes.json().catch(() => ({})) as { error?: string };
          setUploadError(j.error ?? "Falha ao iniciar envio do arquivo.");
          setActingId(null);
          setUploading(false);
          return;
        }
        const { token, path } = await signRes.json() as { signedUrl: string; token: string; path: string };
        const { error: storageError } = await supabase.storage
          .from(CONTRACTS_BUCKET)
          .uploadToSignedUrl(path, token, signedFile, { contentType: "application/pdf" });
        if (storageError) {
          setUploadError("Falha ao enviar arquivo. Tente novamente.");
          setActingId(null);
          setUploading(false);
          return;
        }
        signedPath = path;
      } finally {
        setUploading(false);
      }
    }

    const body: Record<string, string> = {};
    if (signedPath) body.signed_contract_url = signedPath;

    const res = await fetch(`/api/contracts/${contract.id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string };

    if (!res.ok) {
      setError(payload.error ?? "Não foi possível assinar o contrato.");
      setActingId(null);
      return;
    }

    setContracts((prev) => prev.map((c) => {
      if (c.id !== contract.id) return c;
      return {
        ...c,
        status: "signed",
        signedAt: new Date().toISOString(),
        ...(signedPath ? { signedContractUrl: `/api/contracts/${c.id}/file?type=signed` } : {}),
      };
    }));
    closeModal();
    setActingId(null);
  }

  async function handleReject(contract: WorkspaceTalentContract) {
    setActingId(contract.id);
    setError(null);

    const res = await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string };

    if (!res.ok) {
      setError(payload.error ?? "Não foi possível recusar o contrato.");
      setActingId(null);
      return;
    }

    setContracts((prev) => prev.map((c) => c.id === contract.id ? { ...c, status: "rejected" } : c));
    closeModal();
    setActingId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Portal do talento</p>
        <h1 className="mt-1 text-[1.8rem] font-bold tracking-tight text-zinc-950">Contratos</h1>
        <p className="mt-1 text-[14px] text-zinc-500">Contratos enviados por {workspaceName}.</p>
      </div>

      {contracts.length === 0 && (
        <div className="rounded-[22px] border border-zinc-200 bg-white px-6 py-14 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: `linear-gradient(135deg, ${primary}20, ${accent}10)` }}
          >
            <svg className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-zinc-600">Nenhum contrato com esta agência ainda.</p>
          <p className="mt-1 text-[13px] text-zinc-400">Os contratos enviados pela agência aparecerão aqui assim que forem criados.</p>
        </div>
      )}

      <ContractSection title="Aguardando sua ação" contracts={pending} primary={primary} accent={accent}
        onDetails={(id) => openModal("details", id)}
        onSign={(id) => openModal("sign", id)}
        onReject={(id) => openModal("reject", id)}
      />
      <ContractSection title="Em andamento" contracts={active} primary={primary} accent={accent}
        onDetails={(id) => openModal("details", id)}
        onSign={(id) => openModal("sign", id)}
        onReject={(id) => openModal("reject", id)}
      />
      <ContractSection title="Pagos" contracts={paid} primary={primary} accent={accent}
        onDetails={(id) => openModal("details", id)}
        onSign={(id) => openModal("sign", id)}
        onReject={(id) => openModal("reject", id)}
      />
      <ContractSection title="Histórico" contracts={history} primary={primary} accent={accent}
        onDetails={(id) => openModal("details", id)}
        onSign={(id) => openModal("sign", id)}
        onReject={(id) => openModal("reject", id)}
      />

      {/* Modal */}
      {modalContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="w-full max-w-lg rounded-[24px] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.22)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{modalContract.agencyName}</p>
                <h2 className="mt-0.5 text-[18px] font-semibold text-zinc-950">{modalContract.jobTitle}</h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {/* Details view */}
              {modal?.kind === "details" && (
                <>
                  <ContractDetails contract={modalContract} />
                  <div className="flex flex-wrap gap-2">
                    {modalContract.contractFileUrl && (
                      <a href={modalContract.contractFileUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Baixar contrato
                      </a>
                    )}
                    {modalContract.signedContractUrl && (
                      <a href={modalContract.signedContractUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Versão assinada
                      </a>
                    )}
                    {!modalContract.contractFileUrl && (
                      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
                        Este contrato não possui PDF anexado. Você ainda pode aceitar digitalmente.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AbrirDisputaButton
                      contractId={modalContract.id}
                      contractStatus={modalContract.status}
                      activeDisputeId={modalContract.activeDisputeId}
                      activeDisputeHref={null}
                      disputeListHref={`/talent/workspaces/${workspaceSlug}/disputes`}
                    />
                  </div>
                </>
              )}

              {/* Sign flow — mirrors Open Space TalentContracts DocuSign flow */}
              {modal?.kind === "sign" && (
                <>
                  {modalContract.contractFileUrl ? (
                    // Has original PDF: DocuSign-style upload flow
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-[13px] font-semibold text-indigo-900">Assinar contrato</p>
                            <p className="mt-0.5 text-[12px] text-indigo-600 leading-relaxed">
                              Baixe o contrato, assine, digitalize e faça o upload da versão assinada abaixo.
                            </p>
                          </div>
                          <a
                            href={modalContract.contractFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white border border-indigo-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Baixar contrato
                          </a>
                        </div>

                        {/* Upload signed PDF */}
                        <label className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-[13px] bg-white border border-indigo-200 rounded-xl hover:border-indigo-300 cursor-pointer transition-colors">
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <span className={`${signedFile ? "text-zinc-800 truncate" : "text-zinc-400"} flex-1`}>
                            {signedFile ? signedFile.name : "Enviar contrato assinado (PDF)"}
                          </span>
                          {signedFile && (
                            <button type="button" onClick={(e) => { e.preventDefault(); setSignedFile(null); setUploadError(""); }}
                              className="text-zinc-400 hover:text-rose-500 transition-colors flex-shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          <input
                            type="file" accept=".pdf,application/pdf" className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              setUploadError("");
                              if (!file) { setSignedFile(null); return; }
                              if (!/\.pdf$/i.test(file.name)) { setSignedFile(null); setUploadError("Apenas arquivos PDF são aceitos."); return; }
                              if (file.size > 20 * 1024 * 1024) { setSignedFile(null); setUploadError("O arquivo deve ter no máximo 20 MB."); return; }
                              setSignedFile(file);
                            }}
                          />
                        </label>

                        {uploadError && <p className="text-[12px] text-rose-600">{uploadError}</p>}
                      </div>

                      <ContractDetails contract={modalContract} compact />

                      {error && (
                        <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={closeModal}
                          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSign(modalContract)}
                          disabled={actingId === modalContract.id || uploading || !signedFile}
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:bg-zinc-300"
                        >
                          {(actingId === modalContract.id || uploading) ? "Enviando..." : "Confirmar assinatura"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // No original PDF: digital acceptance
                    <div className="space-y-4">
                      <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3.5 flex items-start gap-3">
                        <svg className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[13px] text-violet-800">
                          Este contrato não possui PDF. Ao aceitar, você confirma digitalmente os termos enviados pela agência.
                        </p>
                      </div>

                      <ContractDetails contract={modalContract} compact />

                      {error && (
                        <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={closeModal}
                          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSign(modalContract)}
                          disabled={actingId === modalContract.id}
                          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-zinc-300"
                          style={{ background: actingId === modalContract.id ? undefined : primary }}
                        >
                          {actingId === modalContract.id ? "Aceitando..." : "Aceitar contrato"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Reject confirmation */}
              {modal?.kind === "reject" && (
                <div className="space-y-4">
                  <p className="text-[15px] font-medium text-zinc-900">Tem certeza que deseja recusar este contrato?</p>
                  <p className="text-[13px] leading-6 text-zinc-500">
                    A agência verá o status como recusado. Se precisar, fale com a agência antes de aceitar outro contrato.
                  </p>
                  <ContractDetails contract={modalContract} compact />
                  {error && (
                    <p className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{error}</p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={closeModal}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(modalContract)}
                      disabled={actingId === modalContract.id}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-700 transition-colors disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {actingId === modalContract.id ? "Recusando..." : "Recusar contrato"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractSection({
  title,
  contracts,
  primary,
  accent,
  onDetails,
  onSign,
  onReject,
}: {
  title: string;
  contracts: WorkspaceTalentContract[];
  primary: string;
  accent: string;
  onDetails: (id: string) => void;
  onSign: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (contracts.length === 0) return null;
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{title}</p>
      <ul className="flex flex-col gap-3">
        {contracts.map((c) => (
          <li key={c.id}>
            <ContractCard contract={c} primary={primary} accent={accent}
              onDetails={onDetails} onSign={onSign} onReject={onReject}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ContractCard({
  contract,
  primary,
  accent,
  onDetails,
  onSign,
  onReject,
}: {
  contract: WorkspaceTalentContract;
  primary: string;
  accent: string;
  onDetails: (id: string) => void;
  onSign: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const status       = mapStatus(contract.status);
  const isActionable = ACTIONABLE_STATUSES.has(status);
  const state = getContractComputedState(
    {
      status,
      paid_at: contract.paidAt,
      workspace_id: "ws", // Workspace talent contracts are always Premium context
      payment_amount: contract.paymentAmount,
      commission_amount: contract.commissionAmount,
      net_amount: contract.netAmount,
    },
    { isAgentJobBacked: contract.isAgentJobBacked ?? false, viewerRole: "talent" },
  );
  const label = state.displayBadge;
  const tone  = state.displayTone;
  const { grossAmount: gross, commissionAmount: commission, netAmount: net, commissionPct } = state;

  return (
    <div className="overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="h-[3px]" style={{ background: `linear-gradient(to right, ${primary}, ${accent})` }} />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-zinc-900">{contract.jobTitle}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{contract.agencyName}</p>
            <p className="mt-1 text-[12px] text-zinc-500">
              {fmtJobDate(contract.jobDate)}
              {contract.jobTime ? ` · ${String(contract.jobTime).slice(0, 5)}` : ""}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>
        </div>

        <div className="space-y-0.5 text-[12px] text-zinc-500">
          <div className="flex flex-wrap gap-4">
            <span>
              <span className="font-medium text-zinc-700">Você recebe: </span>
              <span className="font-semibold text-emerald-600">{brl(net)}</span>
            </span>
            <span>
              <span className="font-medium text-zinc-700">Bruto: </span>
              {brl(gross)}
            </span>
          </div>
          {commission > 0 && (
            <p className="text-[11px] text-zinc-400">
              Comissão da plataforma ({commissionPct}%): −{brl(commission)}
            </p>
          )}
        </div>

        {formatJobLocation(contract.location) && (
          <p className="text-[12px] text-zinc-500">
            <span className="font-medium text-zinc-700">Local: </span>
            {formatJobLocation(contract.location)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onDetails(contract.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Ver detalhes
          </button>

          {contract.contractFileUrl && (
            <a href={contract.contractFileUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              Baixar contrato
            </a>
          )}

          {isActionable && (
            <>
              <button type="button" onClick={() => onSign(contract.id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-colors"
                style={{ background: primary }}
              >
                {contract.contractFileUrl ? "Assinar contrato" : "Aceitar contrato"}
              </button>
              <button type="button" onClick={() => onReject(contract.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                Recusar
              </button>
            </>
          )}

          {contract.signedContractUrl && !isActionable && (
            <a href={contract.signedContractUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Versão assinada
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractDetails({
  contract,
  compact = false,
}: {
  contract: WorkspaceTalentContract;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-4 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
      <DetailField label="Data" value={fmtJobDate(contract.jobDate)} />
      <DetailField label="Horário" value={contract.jobTime ?? "—"} />
      <DetailField label="Local" value={formatJobLocation(contract.location) ?? "—"} />
      <DetailField label="Pagamento" value={`${brl(contract.paymentAmount)}${contract.paymentMethod ? ` · ${contract.paymentMethod}` : ""}`} />
      {!compact && contract.jobDescription && (
        <div className="sm:col-span-2 lg:col-span-4">
          <DetailField label="Descrição" value={contract.jobDescription} multiline />
        </div>
      )}
      {!compact && contract.additionalNotes && (
        <div className="sm:col-span-2 lg:col-span-4">
          <DetailField label="Observações" value={contract.additionalNotes} multiline />
        </div>
      )}
      <DetailField label="Criado em" value={fmtDate(contract.createdAt)} />
      {contract.signedAt && <DetailField label="Assinado em" value={fmtDate(contract.signedAt)} />}
    </div>
  );
}

function DetailField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className={`text-[13px] text-zinc-700 ${multiline ? "whitespace-pre-line leading-6" : "font-medium"}`}>{value}</p>
    </div>
  );
}
