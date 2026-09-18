"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DATE_FORMAT_LABEL,
  detectColumns,
  mapRecords,
  parseCsvText,
  type ColumnMapping,
  type CsvRecord,
  type DateFormat,
} from "@/lib/csv";
import { Badge, Button, Field, FormError, LinkButton, Money, Select } from "@/components/ui";
import { importTransactions, type ImportResult } from "@/server/actions/import";

type Step = 1 | 2 | 3;
type AmountMode = "single" | "split";

const STEPS = ["Choose file", "Map columns", "Done"];

export function ImportWizard({ accounts, currency }: { accounts: { id: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<CsvRecord[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: "", payee: "", memo: "", amount: "", debit: "", credit: "" });
  const [mode, setMode] = useState<AmountMode>("single");
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [invertSign, setInvertSign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, startImport] = useTransition();

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is over 5 MB. Export a shorter date range.");
      return;
    }
    const text = await file.text();
    const parsed = parseCsvText(text);
    if (parsed.headers.length === 0 || parsed.records.length === 0) {
      setError("Couldn't find a header row and data in that file.");
      return;
    }
    const detected = detectColumns(parsed.headers);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRecords(parsed.records);
    setParseErrors(parsed.errors);
    setMapping(detected);
    setMode(detected.debit || detected.credit ? "split" : "single");
    setDateFormat("auto");
    setInvertSign(false);
    setStep(2);
  };

  const effectiveMapping = useMemo<ColumnMapping>(
    () => (mode === "single" ? { ...mapping, debit: "", credit: "" } : { ...mapping, amount: "" }),
    [mapping, mode],
  );

  const mapped = useMemo(
    () => (step === 2 ? mapRecords(records, { mapping: effectiveMapping, dateFormat, invertSign }) : { rows: [], errors: [] }),
    [records, effectiveMapping, dateFormat, invertSign, step],
  );

  const mappingReady =
    Boolean(effectiveMapping.date && effectiveMapping.payee) &&
    (mode === "single" ? Boolean(effectiveMapping.amount) : Boolean(effectiveMapping.debit || effectiveMapping.credit));

  const runImport = () => {
    setError(null);
    startImport(async () => {
      const r = await importTransactions({
        accountId,
        rows: mapped.rows.map(({ date, payee, memo, amount }) => ({ date, payee, memo, amount })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r);
      setStep(3);
      router.refresh();
    });
  };

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRecords([]);
    setParseErrors([]);
    setResult(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border font-semibold",
                  n === step ? "border-accent bg-accent text-accent-foreground" : n < step ? "border-accent text-accent" : "border-border text-muted",
                )}
              >
                {n}
              </span>
              <span className={n === step ? "font-medium" : "text-muted"}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <FormError message={error} />

      {step === 1 && (
        <div className="mt-3 space-y-4 rounded-xl border border-border bg-card p-5">
          <Field label="Import into account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CSV file" hint="Most banks offer a CSV download under statements or activity.">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted hover:bg-border/20">
              <FileText className="h-6 w-6" aria-hidden />
              <span>Tap to choose a .csv file</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="mt-3 space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted" aria-hidden />
                <span className="font-medium">{fileName}</span>
                <span className="text-muted">· {records.length} rows</span>
              </span>
              <button type="button" onClick={reset} className="text-accent hover:underline">
                Choose a different file
              </button>
            </div>
            {parseErrors.length > 0 && (
              <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                {parseErrors.length} line{parseErrors.length === 1 ? "" : "s"} could not be parsed: {parseErrors[0]}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <ColumnPick label="Date column" value={mapping.date} headers={headers} onChange={(v) => setMapping({ ...mapping, date: v })} />
              <ColumnPick label="Payee column" value={mapping.payee} headers={headers} onChange={(v) => setMapping({ ...mapping, payee: v })} />
              <ColumnPick label="Memo column" value={mapping.memo} headers={headers} optional onChange={(v) => setMapping({ ...mapping, memo: v })} />
              <Field label="Amount layout">
                <Select value={mode} onChange={(e) => setMode(e.target.value as AmountMode)}>
                  <option value="single">One signed amount column</option>
                  <option value="split">Separate debit and credit columns</option>
                </Select>
              </Field>
              {mode === "single" ? (
                <ColumnPick label="Amount column" value={mapping.amount} headers={headers} onChange={(v) => setMapping({ ...mapping, amount: v })} />
              ) : (
                <>
                  <ColumnPick label="Debit (money out)" value={mapping.debit} headers={headers} optional onChange={(v) => setMapping({ ...mapping, debit: v })} />
                  <ColumnPick label="Credit (money in)" value={mapping.credit} headers={headers} optional onChange={(v) => setMapping({ ...mapping, credit: v })} />
                </>
              )}
              <Field label="Date format">
                <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                  {(Object.keys(DATE_FORMAT_LABEL) as DateFormat[]).map((k) => (
                    <option key={k} value={k}>
                      {DATE_FORMAT_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {mode === "single" && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={invertSign} onChange={(e) => setInvertSign(e.target.checked)} className="h-4 w-4 accent-accent" />
                Invert sign (my bank lists spending as positive)
              </label>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm">
              <span className="font-medium">Preview</span>
              <span className="text-muted">
                {mapped.rows.length} ready
                {mapped.errors.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-red-600 dark:text-red-400">{mapped.errors.length} skipped</span>
                  </>
                )}
              </span>
            </div>
            {mappingReady ? (
              <ul className="divide-y divide-border">
                {mapped.rows.slice(0, 10).map((r) => (
                  <li key={r.line} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted">{r.date}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.payee}
                      {r.memo && <span className="text-muted"> · {r.memo}</span>}
                    </span>
                    <Badge tone={r.amount < 0 ? "red" : "emerald"}>{r.amount < 0 ? "Out" : "In"}</Badge>
                    <Money cents={r.amount} currency={currency} colored signed className="shrink-0 font-medium" />
                  </li>
                ))}
                {mapped.rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No rows could be read with this mapping.</li>}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted">Pick the date, payee and amount columns to see a preview.</p>
            )}
            {mapped.errors.length > 0 && (
              <details className="border-t border-border px-4 py-2 text-xs text-muted">
                <summary className="cursor-pointer">Skipped lines</summary>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                  {mapped.errors.slice(0, 50).map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={importing || !mappingReady || mapped.rows.length === 0}>
              {importing ? "Importing…" : `Import ${mapped.rows.length} row${mapped.rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result?.ok && (
        <div className="mt-3 rounded-xl border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">
            {result.imported} imported
            {result.skipped > 0 && <span className="text-muted">, {result.skipped} skipped as duplicates</span>}
          </h2>
          <p className="mt-1 text-sm text-muted">New transactions are waiting in Review with suggested categories.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {result.imported > 0 && <LinkButton href="/review">Review them now</LinkButton>}
            <LinkButton href="/transactions" variant="secondary">
              View transactions
            </LinkButton>
            <Button variant="ghost" onClick={reset}>
              Import another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnPick({
  label,
  value,
  headers,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  headers: string[];
  optional?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{optional ? "None" : "Choose a column…"}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    </Field>
  );
}
