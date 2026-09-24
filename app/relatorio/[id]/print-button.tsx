"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#08684e] px-4 text-sm font-medium text-white shadow-sm hover:bg-[#07533f]"><Printer className="size-4" /> Imprimir ou salvar em PDF</button>;
}
