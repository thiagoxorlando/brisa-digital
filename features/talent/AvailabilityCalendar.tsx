"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Entry = {
  id: string;
  talent_id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};

type SelectionMode = "manual" | "range";
type AvailabilityType = "full_day" | "custom_hours" | "unavailable";
type Feedback = { type: "success" | "error"; message: string } | null;

interface Props {
  talentId: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function addMonths(year: number, month: number, delta: number) {
  const next = new Date(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

function getDatesInRange(start: string, end: string) {
  const result: string[] = [];
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  const current = first <= last ? new Date(first) : new Date(last);
  const target = first <= last ? new Date(last) : new Date(first);

  while (current <= target) {
    result.push(iso(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function entrySignature(entry?: Entry) {
  if (!entry) return "empty";
  if (!entry.is_available) return "unavailable";
  if (entry.start_time || entry.end_time) return `custom:${entry.start_time ?? ""}:${entry.end_time ?? ""}`;
  return "full_day";
}

function ChoiceButton({
  active,
  disabled = false,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-2xl border px-4 py-3 text-left transition-all",
        active
          ? "border-[#1ABC9C] bg-[#D1F4EB] shadow-[0_6px_16px_rgba(26,188,156,0.18)]"
          : "border-[#DDE6E6] bg-white hover:border-[#B8D4D4] hover:bg-[#F8FAFC]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <p className={["text-[13px] font-semibold", active ? "text-emerald-900" : "text-zinc-900"].join(" ")}>
        {title}
      </p>
      <p className={["mt-1 text-[12px] leading-relaxed", active ? "text-emerald-700" : "text-zinc-500"].join(" ")}>
        {description}
      </p>
    </button>
  );
}

export default function AvailabilityCalendar({ talentId }: Props) {
  const today = iso(new Date());
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>("full_day");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadEntries = useCallback(async (currentYear: number, currentMonth: number) => {
    const previous = addMonths(currentYear, currentMonth, -1);
    const next = addMonths(currentYear, currentMonth, 1);
    const from = iso(startOfMonth(previous.year, previous.month));
    const to = iso(new Date(next.year, next.month + 1, 0));

    const response = await fetch(`/api/talent/availability?talent_id=${talentId}&from=${from}&to=${to}`);
    const json = await response.json();

    if (json.availability) {
      setEntries((previousEntries) => {
        const nextEntries = new Map(previousEntries);
        for (const entry of json.availability as Entry[]) nextEntries.set(entry.date, entry);
        return nextEntries;
      });
    }
  }, [talentId]);

  useEffect(() => {
    loadEntries(year, month);
  }, [year, month, loadEntries]);

  const firstWeekday = startOfMonth(year, month).getDay();
  const totalDays = daysInMonth(year, month);
  const calendarCells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const monthDates = useMemo(
    () => Array.from({ length: totalDays }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
    [month, totalDays, year],
  );

  const selectedDateList = useMemo(
    () => [...selectedDates].sort((left, right) => left.localeCompare(right)),
    [selectedDates],
  );
  const selectedEntries = useMemo(
    () => selectedDateList.map((date) => entries.get(date)),
    [entries, selectedDateList],
  );
  const selectionCount = selectedDateList.length;
  const hasMixedSelection = useMemo(
    () => new Set(selectedEntries.map((entry) => entrySignature(entry))).size > 1,
    [selectedEntries],
  );

  useEffect(() => {
    if (selectedDateList.length === 0) {
      setAvailabilityType("full_day");
      setStartTime("");
      setEndTime("");
    }
  }, [selectedDateList.length]);

  function cellDate(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function clearSelection(options?: { clearFeedback?: boolean; resetMode?: boolean }) {
    const { clearFeedback = true, resetMode = true } = options ?? {};
    setSelectedDates(new Set());
    if (resetMode) setSelectionMode("manual");
    setRangeStart(null);
    if (clearFeedback) setFeedback(null);
  }

  function selectWholeMonth() {
    setSelectedDates(new Set(monthDates.filter((date) => date >= today)));
    setSelectionMode("manual");
    setRangeStart(null);
    setFeedback(null);
  }

  function handleDateClick(date: string) {
    if (date < today) return;

    setFeedback(null);

    if (selectionMode === "range") {
      if (!rangeStart) {
        setRangeStart(date);
        setSelectedDates(new Set([date]));
        return;
      }

      const range = getDatesInRange(rangeStart, date).filter((value) => value >= today);
      setSelectedDates(new Set(range));
      setSelectionMode("manual");
      setRangeStart(null);
      return;
    }

    setSelectedDates((previousDates) => {
      const nextDates = new Set(previousDates);
      if (nextDates.has(date)) nextDates.delete(date);
      else nextDates.add(date);
      return nextDates;
    });
  }

  async function upsertEntry(date: string, isAvailable: boolean, customStart?: string, customEnd?: string) {
    const response = await fetch("/api/talent/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talent_id: talentId,
        date,
        is_available: isAvailable,
        start_time: customStart ?? null,
        end_time: customEnd ?? null,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.entry) {
      throw new Error(json.error ?? "Não foi possível salvar a disponibilidade.");
    }

    return json.entry as Entry;
  }

  async function deleteEntry(date: string) {
    const response = await fetch(`/api/talent/availability?talent_id=${talentId}&date=${date}`, { method: "DELETE" });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error ?? "Não foi possível limpar a disponibilidade.");
    }
  }

  async function applySelection() {
    if (selectionCount === 0) return;
    if (availabilityType === "custom_hours" && (!startTime || !endTime)) {
      setFeedback({ type: "error", message: "Escolha o horário inicial e final antes de salvar." });
      return;
    }

    const dates = selectedDateList.filter((date) => date >= today);
    if (dates.length === 0) return;

    setSaving((current) => {
      const next = new Set(current);
      dates.forEach((date) => next.add(date));
      return next;
    });

    try {
      const updatedEntries = await Promise.all(
        dates.map((date) =>
          upsertEntry(
            date,
            availabilityType !== "unavailable",
            availabilityType === "custom_hours" ? startTime : undefined,
            availabilityType === "custom_hours" ? endTime : undefined,
          ),
        ),
      );

      setEntries((current) => {
        const next = new Map(current);
        updatedEntries.forEach((entry) => next.set(entry.date, entry));
        return next;
      });

      setFeedback({
        type: "success",
        message:
          selectionCount === 1
            ? "Disponibilidade atualizada com sucesso."
            : `Disponibilidade aplicada a ${selectionCount} datas.`,
      });
      clearSelection({ clearFeedback: false, resetMode: false });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar a disponibilidade.",
      });
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        dates.forEach((date) => next.delete(date));
        return next;
      });
    }
  }

  async function clearAvailability() {
    if (selectionCount === 0) return;

    const dates = selectedDateList.filter((date) => date >= today);
    if (dates.length === 0) return;

    setSaving((current) => {
      const next = new Set(current);
      dates.forEach((date) => next.add(date));
      return next;
    });

    try {
      await Promise.all(dates.map((date) => deleteEntry(date)));
      setEntries((current) => {
        const next = new Map(current);
        dates.forEach((date) => next.delete(date));
        return next;
      });
      setFeedback({
        type: "success",
        message: selectionCount === 1 ? "Informação removida da data selecionada." : "Informação removida das datas selecionadas.",
      });
      clearSelection({ clearFeedback: false, resetMode: false });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Não foi possível limpar a disponibilidade.",
      });
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        dates.forEach((date) => next.delete(date));
        return next;
      });
    }
  }

  const selectionSummary =
    selectionCount === 0
      ? "Nenhuma data selecionada"
      : selectionCount === 1
        ? formatDateLabel(selectedDateList[0])
        : `${selectionCount} datas selecionadas`;

  const selectionDescription =
    selectionCount === 0
      ? "Escolha um ou mais dias no calendário para aplicar a disponibilidade."
      : selectionCount === 1
        ? "A ação abaixo será aplicada apenas a esta data."
        : "A ação abaixo será aplicada a todas as datas selecionadas.";

  const selectionModeDescription =
    selectionMode === "range"
      ? rangeStart
        ? `Data inicial definida em ${formatShortDateLabel(rangeStart)}. Agora clique na data final.`
        : "Clique na data inicial e depois na data final para selecionar um intervalo."
      : "Clique em um dia para selecionar. Clique em outros dias para adicionar ou remover datas.";

  const todayEntry = entries.get(today);
  const availToday = todayEntry?.is_available;

  return (
    <div className="space-y-6">
      {/* Today's status banner — live, updates when availability is applied */}
      <div className={[
        "flex items-center gap-3 rounded-2xl px-5 py-4 border",
        availToday === true  ? "bg-emerald-50 border-emerald-100" :
        availToday === false ? "bg-zinc-50 border-zinc-100"       : "bg-violet-50 border-violet-100",
      ].join(" ")}>
        <div className={[
          "w-2.5 h-2.5 rounded-full flex-shrink-0",
          availToday === true  ? "bg-emerald-500" :
          availToday === false ? "bg-zinc-400"    : "bg-violet-400",
        ].join(" ")} />
        <div className="flex-1 min-w-0">
          {availToday === true ? (
            <>
              <p className="text-[13px] font-semibold text-emerald-800">
                Você está disponível hoje
                {todayEntry?.start_time && (
                  <span className="font-normal text-emerald-600">
                    {" "}· {todayEntry.start_time.slice(0, 5)}
                    {todayEntry.end_time && `–${todayEntry.end_time.slice(0, 5)}`}
                  </span>
                )}
              </p>
              <p className="text-[12px] text-emerald-600 mt-0.5">Agências podem ver sua disponibilidade e entrar em contato.</p>
            </>
          ) : availToday === false ? (
            <>
              <p className="text-[13px] font-semibold text-zinc-600">Você está indisponível hoje</p>
              <p className="text-[12px] text-zinc-400 mt-0.5">Altere no calendário abaixo.</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-violet-700">Marque sua disponibilidade para hoje</p>
              <p className="text-[12px] text-violet-500 mt-0.5">Agências priorizam talentos com disponibilidade informada.</p>
            </>
          )}
        </div>
      </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 px-5 py-4">
          <p className="text-[13px] font-semibold text-emerald-900">Selecione as datas primeiro</p>
          <p className="mt-1 text-[12px] leading-relaxed text-emerald-700">
            1. Selecione uma ou mais datas. 2. Escolha a disponibilidade no painel ao lado. 3. Clique em Aplicar.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 border-b border-zinc-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2 sm:min-w-[250px]">
              <button
                type="button"
                onClick={() => {
                  const previous = addMonths(year, month, -1);
                  setYear(previous.year);
                  setMonth(previous.month);
                  clearSelection();
                }}
                className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white hover:text-zinc-800 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-[15px] font-semibold text-zinc-900">
                {MONTH_NAMES[month]} {year}
              </h2>
              <button
                type="button"
                onClick={() => {
                  const next = addMonths(year, month, 1);
                  setYear(next.year);
                  setMonth(next.month);
                  clearSelection();
                }}
                className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white hover:text-zinc-800 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectWholeMonth}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 cursor-pointer"
              >
                Selecionar mês inteiro
              </button>
              <button
                type="button"
                onClick={() => clearSelection()}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 cursor-pointer"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-1 text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                {weekday}
              </div>
            ))}

            {calendarCells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} />;

              const date = cellDate(day);
              const entry = entries.get(date);
              const isPast = date < today;
              const isSelected = selectedDates.has(date);
              const isRangeStart = rangeStart === date;
              const isToday = date === today;
              const isSaving = saving.has(date);

              let cellClass = "border border-transparent bg-zinc-50 text-zinc-700 hover:border-zinc-200 hover:bg-zinc-100";

              if (entry?.is_available === true) {
                cellClass = "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
              } else if (entry?.is_available === false) {
                cellClass = "border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200";
              }

              if (isSelected) {
                cellClass = "border border-[#1F2D2E] bg-[#1F2D2E] text-white shadow-[0_6px_16px_rgba(31,45,46,0.24)]";
              }

              if (isRangeStart && selectionMode === "range") {
                cellClass = "border border-emerald-500 bg-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]";
              }

              if (isPast) {
                cellClass = "cursor-not-allowed border border-zinc-100 bg-zinc-50 text-[#647B7B]";
              } else if (!isSelected && isToday) {
                cellClass += " ring-2 ring-[#1ABC9C] ring-offset-2";
              }

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => handleDateClick(date)}
                  aria-pressed={isSelected}
                  disabled={isPast}
                  className={[
                    "relative min-h-[60px] rounded-2xl px-2 py-3 text-center text-[14px] font-semibold transition-all touch-manipulation select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1ABC9C] focus-visible:ring-offset-2",
                    cellClass,
                    isSaving ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <span>{day}</span>
                  {isSelected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/18 text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                  {entry?.is_available === true && !isSelected && (
                    <span className="absolute bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-500" />
                  )}
                  {entry?.is_available === false && !isSelected && (
                    <span className="absolute bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-zinc-400" />
                  )}
                  {isSaving && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/60">
                      <svg className="h-4 w-4 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-100 bg-white px-4 py-3 text-[12px] text-zinc-500 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Disponível
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
            Indisponível
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#1F2D2E]" />
            Selecionado
          </span>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6">
        <div className="space-y-4 rounded-3xl border border-zinc-100 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.04)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ação</p>
            <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-zinc-950">Aplicar disponibilidade</h3>
          </div>

          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4">
            <p className="text-[13px] font-semibold text-zinc-900">{selectionSummary}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{selectionDescription}</p>
            {selectedDateList.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedDateList.slice(0, 6).map((date) => (
                  <span key={date} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                    {formatShortDateLabel(date)}
                  </span>
                ))}
                {selectedDateList.length > 6 && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                    +{selectedDateList.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-400">Modo de seleção</p>
              {rangeStart && selectionMode === "range" && (
                <span className="text-[11px] font-medium text-emerald-700">
                  Início: {formatShortDateLabel(rangeStart)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceButton
                active={selectionMode === "manual"}
                title="Seleção livre"
                description="Clique em dias individuais para montar sua seleção."
                onClick={() => {
                  setSelectionMode("manual");
                  setRangeStart(null);
                }}
              />
              <ChoiceButton
                active={selectionMode === "range"}
                title="Selecionar intervalo"
                description="Defina data inicial e final para selecionar uma faixa."
                onClick={() => {
                  setSelectionMode("range");
                  setRangeStart(null);
                }}
              />
            </div>
            <p className="text-[12px] leading-relaxed text-zinc-500">{selectionModeDescription}</p>
          </div>

          <div className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-widest text-zinc-400">Disponibilidade</p>
            <div className="grid gap-2">
              <ChoiceButton
                active={availabilityType !== "unavailable"}
                title="Disponível"
                description="Seu perfil pode aparecer para convites nessas datas."
                onClick={() => {
                  setAvailabilityType("full_day");
                  setStartTime("");
                  setEndTime("");
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={availabilityType === "full_day"}
                  title="Dia inteiro"
                  description="Sem definir horário."
                  disabled={availabilityType === "unavailable"}
                  onClick={() => {
                    setAvailabilityType("full_day");
                    setStartTime("");
                    setEndTime("");
                  }}
                />
                <ChoiceButton
                  active={availabilityType === "custom_hours"}
                  title="Horário personalizado"
                  description="Defina início e fim."
                  disabled={availabilityType === "unavailable"}
                  onClick={() => setAvailabilityType("custom_hours")}
                />
              </div>
              <ChoiceButton
                active={availabilityType === "unavailable"}
                title="Indisponível"
                description="As agências não devem considerar essas datas."
                onClick={() => {
                  setAvailabilityType("unavailable");
                  setStartTime("");
                  setEndTime("");
                }}
              />
            </div>
          </div>

          {availabilityType === "custom_hours" && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Início</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-900 transition-colors focus:border-zinc-950 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Fim</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-900 transition-colors focus:border-zinc-950 focus:outline-none"
                />
              </div>
            </div>
          )}

          {hasMixedSelection && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
              <p className="text-[12px] font-semibold text-amber-900">Atenção</p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-700">
                As datas selecionadas têm configurações diferentes no momento. A ação abaixo vai substituir todas elas.
              </p>
            </div>
          )}

          {feedback && (
            <div
              className={[
                "rounded-2xl px-4 py-3",
                feedback.type === "success"
                  ? "border border-emerald-100 bg-emerald-50 text-emerald-800"
                  : "border border-rose-100 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              <p className="text-[12px] font-medium leading-relaxed">{feedback.message}</p>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={applySelection}
              disabled={selectionCount === 0 || (availabilityType === "custom_hours" && (!startTime || !endTime))}
              className="w-full rounded-2xl bg-gradient-to-r from-[#1ABC9C] to-[#27C1D6] px-4 py-3 text-[13px] font-semibold text-white transition-all hover:from-[#17A58A] hover:to-[#22B5C2] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#E6F0F0] disabled:text-[#B8D4D4]"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={clearAvailability}
              disabled={selectionCount === 0}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[13px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:text-[#647B7B]"
            >
              Remover informação das datas selecionadas
            </button>
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
}


