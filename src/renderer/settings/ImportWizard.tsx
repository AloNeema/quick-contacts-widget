import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import type { ImportFile, ImportField, MergeSummary } from "@shared/types";
import { buildIncomingContacts, guessHeaderMapping, IMPORT_FIELD_LABELS, mappingHasRequiredFields } from "@shared/importMapping";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { Switch } from "@renderer/components/ui/switch";
import { useContactsStore } from "@renderer/store/useContacts";

const FIELD_ORDER: ImportField[] = ["name", "firstName", "lastName", "title", "company", "email", "phone", "mobilePhone", "group", "notes", "website", "linkedinUrl", "photoUrl", "ignore"];

export function ImportWizard({ onDone }: { onDone: () => void }) {
  const setContacts = useContactsStore((s) => s.setContacts);
  const existing = useContactsStore((s) => s.contacts);
  const showToast = useContactsStore((s) => s.showToast);

  const [file, setFile] = useState<ImportFile | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [hadHeader, setHadHeader] = useState(true);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MergeSummary | null>(null);

  const loadSheet = (f: ImportFile, idx: number) => {
    const guess = guessHeaderMapping(f.sheets[idx].rows);
    setSheetIdx(idx);
    setMapping(guess.mapping);
    setDataRows(guess.dataRows);
    setHadHeader(guess.hadHeader);
  };

  const pick = async () => {
    setBusy(true);
    try {
      const f = await window.contacts.pickImportFile();
      if (!f) return;
      if (f.sheets.length === 0) {
        showToast("That file has no rows to import.", "error");
        return;
      }
      setResult(null);
      setFile(f);
      loadSheet(f, 0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not read that file", "error");
    } finally {
      setBusy(false);
    }
  };

  const preview = useMemo(() => (file ? buildIncomingContacts(dataRows, mapping) : null), [file, dataRows, mapping]);
  const ready = mappingHasRequiredFields(mapping) && (preview?.contacts.length ?? 0) > 0;
  const header = file && hadHeader ? file.sheets[sheetIdx].rows[0] : null;
  const sampleRows = dataRows.slice(0, 4);

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await window.contacts.applyImport(preview.contacts, { removeMissing });
      setContacts(r.contacts);
      setResult(r.summary);
      showToast(`Imported: ${r.summary.added} new, ${r.summary.updated} updated`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h2 className="text-lg font-semibold">Import complete</h2>
        <ul className="text-sm text-muted-foreground">
          <li>{result.added} added</li>
          <li>{result.updated} updated</li>
          {result.skipped ? <li>{result.skipped} skipped (duplicate or missing phone/email)</li> : null}
          {result.removed ? <li>{result.removed} removed</li> : null}
        </ul>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => { setResult(null); setFile(null); }}>Import another file</Button>
          <Button onClick={onDone}>View contacts</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <section className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">{file ? file.fileName : "Choose an Excel or CSV file"}</p>
            <p className="text-xs text-muted-foreground">
              {file
                ? `${dataRows.length} rows${file.sheets.length > 1 ? ` · ${file.sheets.length} sheets` : ""}`
                : "Columns like Name, Title, Company, Email, Phone and LinkedIn are detected automatically."}
            </p>
          </div>
        </div>
        <Button onClick={() => void pick()} disabled={busy} variant={file ? "outline" : "default"}>
          <Upload /> {file ? "Choose another" : "Choose file"}
        </Button>
      </section>

      {file ? (
        <>
          {file.sheets.length > 1 ? (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">Sheet</Label>
              <select
                value={sheetIdx}
                onChange={(e) => loadSheet(file, Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {file.sheets.map((s, i) => (
                  <option key={s.name} value={i}>{s.name} ({s.rows.length})</option>
                ))}
              </select>
            </div>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Match columns</h2>
            <p className="text-xs text-muted-foreground">Check each column's role. A contact needs a name plus a phone or an email.</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-muted/60">
                    {mapping.map((f, i) => (
                      <th key={i} className="min-w-[150px] px-2 py-2 align-top font-normal">
                        <select
                          value={f}
                          onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? (e.target.value as ImportField) : x)))}
                          className={`h-8 w-full rounded-md border bg-card px-2 text-xs font-medium ${f === "ignore" ? "text-muted-foreground" : "border-primary/50"}`}
                        >
                          {FIELD_ORDER.map((opt) => (
                            <option key={opt} value={opt}>{IMPORT_FIELD_LABELS[opt]}</option>
                          ))}
                        </select>
                        {header ? <p className="mt-1 truncate px-1 text-[11px] text-muted-foreground">{header[i] || `Column ${i + 1}`}</p> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, r) => (
                    <tr key={r} className="border-t">
                      {mapping.map((_, c) => (
                        <td key={c} className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">{row[c] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
            <div className="text-sm">
              <p className="font-medium">
                {preview?.contacts.length ?? 0} contacts ready
                {preview?.skipped ? <span className="text-muted-foreground"> · {preview.skipped} rows skipped</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Existing contacts are matched by email, then phone. Their photos, pins and order are kept.
                {existing.length ? ` You have ${existing.length} today.` : ""}
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <Switch checked={removeMissing} onCheckedChange={setRemoveMissing} />
                Remove contacts that aren't in this file
              </label>
            </div>
            <Button size="lg" onClick={() => void apply()} disabled={!ready || busy}>
              Import {preview?.contacts.length ?? 0} contacts
            </Button>
          </section>
        </>
      ) : null}
    </div>
  );
}
