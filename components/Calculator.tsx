"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConversionResults } from "@/components/ConversionResults";
import { Keypad, type KeypadKey } from "@/components/Keypad";
import { convert } from "@/lib/convert";
import { formatDate, parseInput } from "@/lib/format";
import { RATE_ORDER } from "@/lib/rates";
import type { RateKey, RatesSnapshot } from "@/lib/types";

/** Máximo de dígitos enteros: evita que el display se desborde. */
const MAX_INTEGER_DIGITS = 12;
const MAX_DECIMALS = 2;

/** Aplica una tecla al monto que se está escribiendo. */
function applyKey(current: string, key: KeypadKey): string {
  if (key === "back") return current.slice(0, -1);

  if (key === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : `${current},`;
  }

  const [integer, decimals] = current.split(",");
  if (decimals !== undefined) {
    if (decimals.length >= MAX_DECIMALS) return current;
    return `${current}${key}`;
  }
  if (integer.length >= MAX_INTEGER_DIGITS) return current;
  // "0" solo se conserva como parte de un decimal.
  if (integer === "0") return key;

  return `${current}${key}`;
}

/** Agrupa los miles del monto tecleado para que se lea "74.878,64". */
function displayValue(raw: string): string {
  if (raw === "") return "0";

  const [integer, decimals] = raw.split(",");
  const grouped = new Intl.NumberFormat("es-VE").format(Number(integer || "0"));

  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

export function Calculator({ snapshot }: { snapshot: RatesSnapshot }) {
  const [raw, setRaw] = useState("100");
  const [from, setFrom] = useState<RateKey>("USD_BCV");
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();

  const conversion = useMemo(
    () => convert(parseInput(raw), from, snapshot),
    [raw, from, snapshot],
  );

  const originRate = snapshot.rates[from];

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="monto-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="monto-titulo"
            className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]"
          >
            Monto en
          </h2>
          <button
            type="button"
            onClick={() => startRefresh(() => router.replace(`/?actualizar=${Date.now()}`))}
            disabled={isRefreshing}
            className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-[color:var(--muted)] transition active:scale-95 disabled:opacity-50"
          >
            {isRefreshing ? "Actualizando…" : "↻ Actualizar tasas"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {RATE_ORDER.map((key) => {
            const rate = snapshot.rates[key];
            const selected = key === from;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFrom(key)}
                aria-pressed={selected}
                disabled={rate.bsPerUnit === null}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
                  selected
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
                    : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)]"
                }`}
              >
                {rate.shortLabel}
              </button>
            );
          })}
        </div>

        <output
          aria-live="polite"
          className="tabular block truncate rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 text-right text-4xl font-semibold sm:text-5xl"
        >
          <span className="mr-2 align-middle text-lg font-normal text-[color:var(--muted)]">
            {originRate.symbol}
          </span>
          {displayValue(raw)}
        </output>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Keypad onKey={(key) => setRaw((current) => applyKey(current, key))} onClear={() => setRaw("")} />
        <ConversionResults conversion={conversion} snapshot={snapshot} />
      </div>

      <p className="text-center text-xs text-[color:var(--muted)]">
        Tasas consultadas el {formatDate(snapshot.fetchedAt)} · se actualizan cada 5 minutos
      </p>
    </div>
  );
}
