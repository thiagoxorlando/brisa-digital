"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Entry = {
  id: string;
  talent_id: string;
  date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};

interface Props {
  talentId: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(y: number, m: number) {
  return new Date(y, m, 1);
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function addMonths(y: number, m: number, delta: number) {
  const d = new Date(y, m + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function AvailabilityCalendar({ talentId }: Props) {
  const today = iso(new Date());
  const now   = new Date();

  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const didDrag = useRef(false);
  const [saving, setSaving]     = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState("");
  const [endTime,   setEndTime]   = useState("");
  const [timeChanged, setTimeChanged] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load entries for view window ──────────────────────────────────────────

  const loadEntries = useCallback(async (y: number, m: number) => {
    const { year: py, month: pm } = addMonths(y, m, -1);
    const { year: ny, month: nm } = addMonths(y, m,  1);
    const from = iso(startOfMonth(py, pm));
    const to   = iso(new Date(ny, nm + 1, 0)); // last day of next month

    const res  = await fetch(`/api/talent/availability?talent_id=${talentId}&from=${from}&to=${to}`);
    const json = await res.json();

    if (json.availability) {
      setEntries((prev) => {
        const next = new Map(prev);
        for (const e of json.availability as Entry[]) next.set(e.date, e);
        return next;
      });
    }
  }, [talentId]);

  useEffect(() => { loadEntries(year, month); }, [year, month, loadEntries]);

  // ── Populate time fields when selection changes ───────────────────────────

  useEffect(() => {
    if (!selected) return;
    const e = entries.get(selected);
    setStartTime(e?.start_time ?? "");
    setEndTime(e?.end_time ?? "");
    setTimeChanged(false);
  }, [selected, entries]);

  // ── Save helper ───────────────────────────────────────────────────────────

  async function saveEntry(date: string, is_available: boolean, st?: string, et?: string) {
    setSaving((s) => new Set(s).add(date));
    const res = await fetch("/api/talent/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        talent_id:   talentId,
        date,
        is_available,
        start_time:  st ?? null,
        end_time:    et ?? null,
      }),
    });
    const json = await res.json();
    if (json.entry) {
      setEntries((prev) => new Map(prev).set(date, json.entry));
    }
    setSaving((s) => { const n = new Set(s); n.delete(date); return n; });
  }

  async function clearEntry(date: string) {
    setSaving((s) => new Set(s).add(date));
    await fetch(`/api/talent/availability?talent_id=${talentId}&date=${date}`, { method: "DELETE" });
    setEntries((prev) => { const n = new Map(prev); n.delete(date); return n; });
    setSaving((s) => { const n = new Set(s); n.delete(date); return n; });
  }

  async function saveBulk(dates: string[], is_available: boolean) {
    const futureDates = dates.filter((d) => d >= today);
    if (!futureDates.length) return;
    setSaving((s) => { const n = new Set(s); futureDates.forEach((d) => n.add(d)); return n; });
    await Promise.all(futureDates.map((date) =>
      fetch("/api/talent/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talent_id: talentId, date, is_available, start_time: null, end_time: null }),
      }).then((r) => r.json()).then((json) => {
        if (json.entry) setEntries((prev) => new Map(prev).set(date, json.entry));
      })
    ));
    setSaving((s) => { const n = new Set(s); futureDates.forEach((d) => n.delete(d)); return n; });
    setSelectedDates(new Set());
  }

  function getDatesInRange(a: string, b: string): string[] {
    const result: string[] = [];
    const start = new Date(a + "T00:00:00");
    const end   = new Date(b + "T00:00:00");
    const cur   = start <= end ? new Date(start) : new Date(end);
    const last  = start <= end ? new Date(end)   : new Date(start);
    while (cur <= last) {
      result.push(iso(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  // ── Debounced time save ───────────────────────────────────────────────────

  function scheduleTimeSave(date: string, st: string, et: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveEntry(date, true, st, et), 800);
  }

  // ── Calendar grid ─────────────────────────────────────────────────────────

  const firstDow = startOfMonth(year, month).getDay();
  const totalDays = daysInMonth(year, month);
  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function cellDate(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedEntry = selected ? entries.get(selected) : undefined;
  const allMonthDates = cells.filter(Boolean).map((day) => cellDate(day as number)).filter((d) => d >= today);

  return (
    <div className="space-y-6">

      {/* Month navigation + bulk mark button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { const { year: y, month: m } = addMonths(year, month, -1); setYear(y); setMonth(m); setSelected(null); setSelectedDates(new Set()); }}
          className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-zinc-900">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          onClick={() => { const { year: y, month: m } = addMonths(year, month, 1); setYear(y); setMonth(m); setSelected(null); setSelectedDates(new Set()); }}
          className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Bulk mark buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => saveBulk(allMonthDates, true)}
          className="flex-1 py-2 rounded-xl text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
        >
          Marcar todo o mês disponível
        </button>
        <button
          onClick={() => saveBulk(allMonthDates, false)}
          className="flex-1 py-2 rounded-xl text-[12px] font-semibold bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border border-zinc-200 transition-colors cursor-pointer"
        >
          Marcar todo o mês indisponível
        </button>
      </div>

      {/* Multi-select bulk panel */}
      {selectedDates.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-4">
          <p className="text-[13px] font-medium text-indigo-800">
            {selectedDates.size} {selectedDates.size === 1 ? "dia selecionado" : "dias selecionados"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => saveBulk([...selectedDates], true)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              Disponível
            </button>
            <button
              onClick={() => saveBulk([...selectedDates], false)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-zinc-700 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Indisponível
            </button>
            <button
              onClick={() => setSelectedDates(new Set())}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Weekday headers */}
      <div
        className="grid grid-cols-7 gap-1 select-none"
        onMouseLeave={() => { if (isDragging && dragStart) { setIsDragging(false); setDragStart(null); } }}
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-zinc-400 py-1">{d}</div>
        ))}

        {/* Day cells */}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const dateStr = cellDate(day);
          const isPast  = dateStr < today;
          const isToday = dateStr === today;
          const entry   = entries.get(dateStr);
          const isSel   = selected === dateStr;
          const isMultiSel = selectedDates.has(dateStr);
          const isDragRange = isDragging && dragStart
            ? getDatesInRange(dragStart, dateStr).includes(dateStr)
            : false;
          const isSaving = saving.has(dateStr);

          let bg = "bg-zinc-50 hover:bg-zinc-100 text-zinc-700";
          let dot: React.ReactNode = null;

          if (entry?.is_available === true) {
            bg = isSel
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200";
            dot = !isSel ? (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />
            ) : null;
          } else if (entry?.is_available === false) {
            bg = isSel
              ? "bg-zinc-700 text-white"
              : "bg-zinc-100 text-zinc-400 line-through";
          }

          if (isMultiSel || isDragRange) bg = "bg-indigo-100 text-indigo-700 border border-indigo-300";
          if (isPast) bg = "text-zinc-300 cursor-default";
          if (isToday && !isSel && !isMultiSel && !isDragRange) bg += " ring-2 ring-violet-500 ring-offset-1";

          return (
            <button
              key={dateStr}
              onMouseDown={(e) => {
                if (isPast) return;
                e.preventDefault();
                didDrag.current = false;
                setDragStart(dateStr);
                setIsDragging(true);
                setSelectedDates(new Set([dateStr]));
                setSelected(null);
              }}
              onMouseEnter={() => {
                if (!isDragging || !dragStart || isPast) return;
                const range = getDatesInRange(dragStart, dateStr).filter((d) => d >= today);
                if (range.length > 1) didDrag.current = true;
                setSelectedDates(new Set(range));
              }}
              onMouseUp={() => {
                if (!isDragging) return;
                setIsDragging(false);
                setDragStart(null);
                if (!didDrag.current) {
                  // Single click — treat as selection toggle
                  setSelectedDates(new Set());
                  setSelected((prev) => prev === dateStr ? null : dateStr);
                }
                didDrag.current = false;
              }}
              onClick={(e) => {
                // Suppress if we just finished a drag operation
                if (isPast) return;
                e.stopPropagation();
              }}
              disabled={isPast}
              className={[
                "relative aspect-square flex items-center justify-center rounded-xl text-[13px] font-medium transition-all",
                isPast ? "text-zinc-300 cursor-default" : bg,
                isSaving ? "opacity-60" : "",
              ].join(" ")}
            >
              {day}
              {dot}
              {isSaving && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-3 h-3 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day panel */}
      {selected && (
        <div className="bg-zinc-50 rounded-2xl border border-zinc-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-zinc-700">
              {new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
            {selectedEntry && (
              <button
                onClick={() => { clearEntry(selected); setSelected(null); }}
                className="text-[12px] text-zinc-400 hover:text-rose-500 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Status buttons */}
          <div className="flex gap-2.5">
            <button
              onClick={() => saveEntry(selected, true, startTime || undefined, endTime || undefined)}
              className={[
                "flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2",
                selectedEntry?.is_available === true
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:text-emerald-700",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Disponível
            </button>
            <button
              onClick={() => saveEntry(selected, false)}
              className={[
                "flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2",
                selectedEntry?.is_available === false
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Indisponível
            </button>
          </div>

          {/* Time range — only when available */}
          {selectedEntry?.is_available === true && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Início</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setTimeChanged(true);
                    scheduleTimeSave(selected, e.target.value, endTime);
                  }}
                  className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">Fim</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    setEndTime(e.target.value);
                    setTimeChanged(true);
                    scheduleTimeSave(selected, startTime, e.target.value);
                  }}
                  className="w-full px-3 py-2 text-[13px] rounded-xl border border-zinc-200 focus:border-zinc-900 focus:outline-none bg-white"
                />
              </div>
              {timeChanged && (
                <p className="col-span-2 text-[11px] text-zinc-400">Salvando horário…</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 pt-1">
        {[
          { color: "bg-emerald-400", label: "Disponível" },
          { color: "bg-zinc-400",    label: "Indisponível" },
          { color: "bg-zinc-100 border border-zinc-200", label: "Não informado" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
