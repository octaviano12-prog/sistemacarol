"use client";

import { Printer, Share2 } from "lucide-react";
import { useState } from "react";

const cp1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

function bytes(value: string) {
  const result: number[] = [];
  for (const character of value) { const code = character.codePointAt(0) || 63; result.push(code <= 255 ? code : cp1252[code] ?? 63); }
  return result;
}
function pdfEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function wrapText(text: string, width = 88) {
  const lines: string[] = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) { if (!line) line = word; else if (`${line} ${word}`.length <= width) line += ` ${word}`; else { lines.push(line); line = word; } }
    if (line) lines.push(line);
  }
  return lines;
}
function createPdf(text: string) {
  const lines = wrapText(text); const pageLines = 54;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageLines)) }, (_, index) => lines.slice(index * pageLines, (index + 1) * pageLines));
  const objects: string[] = []; const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((page, index) => { const pageId = pageIds[index]; const contentId = pageId + 1; const content = `BT\n/F1 9 Tf\n45 800 Td\n12 TL\n${page.map((line) => `(${pdfEscape(line)}) Tj T*`).join("\n")}\nET`; objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`; objects[contentId] = `<< /Length ${bytes(content).length} >>\nstream\n${content}\nendstream`; });
  const output: number[] = bytes("%PDF-1.4\n%âãÏÓ\n"); const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) { offsets[id] = output.length; output.push(...bytes(`${id} 0 obj\n${objects[id]}\nendobj\n`)); }
  const xref = output.length;
  output.push(...bytes(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob([new Uint8Array(output)], { type: "application/pdf" });
}

export default function PrintButton({ patientName }: { patientName: string }) {
  const [sharing, setSharing] = useState(false);
  async function shareReport() {
    const report = document.getElementById("patient-report-document"); if (!report) return;
    setSharing(true);
    try {
      const actions = report.querySelector<HTMLElement>("[data-report-actions]"); const previousDisplay = actions?.style.display;
      if (actions) actions.style.display = "none"; const content = report.innerText; if (actions) actions.style.display = previousDisplay || "";
      const slug = patientName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paciente";
      const fileName = `relatorio-${slug}.pdf`; const file = new File([createPdf(content)], fileName, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: `Relatório de ${patientName}`, text: "Segue o relatório atualizado.", files: [file] });
      else { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); window.alert("O PDF foi baixado. Agora você pode anexá-lo na conversa do WhatsApp."); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) window.alert("Não foi possível compartilhar agora. Use a opção Imprimir ou salvar em PDF."); }
    finally { setSharing(false); }
  }
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#b9d1c5] bg-white px-4 text-sm font-medium text-[#07533f] hover:bg-[#f2f8f5]"><Printer className="size-4" /> Imprimir ou salvar em PDF</button><button type="button" disabled={sharing} onClick={shareReport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#08684e] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#07533f] disabled:opacity-60"><Share2 className="size-4" /> {sharing ? "Preparando PDF…" : "Compartilhar relatório"}</button></div>;
}
