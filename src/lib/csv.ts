const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** CSV with a UTF-8 BOM so Excel opens Vietnamese text correctly. */
export const toCSV = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

export function downloadFile(filename: string, data: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
