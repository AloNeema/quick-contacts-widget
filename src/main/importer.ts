import { dialog, BrowserWindow } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ImportFile } from "@shared/types";

const MAX_ROWS = 5000;

export async function pickImportFile(parent: BrowserWindow | null): Promise<ImportFile | null> {
  const result = await dialog.showOpenDialog(parent ?? undefined!, {
    title: "Import contacts from Excel or CSV",
    properties: ["openFile"],
    filters: [
      { name: "Spreadsheets", extensions: ["xlsx", "xlsm", "xls", "csv", "tsv"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readSpreadsheet(result.filePaths[0]);
}

export async function readSpreadsheet(filePath: string): Promise<ImportFile> {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, dense: false });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    const rows = grid.slice(0, MAX_ROWS).map((row) => row.map((v) => (v == null ? "" : String(v).trim())));
    return { name, rows };
  }).filter((s) => s.rows.length > 0);
  return { fileName: path.basename(filePath), sheets };
}
