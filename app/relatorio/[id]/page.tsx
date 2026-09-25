"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { calculateSessionCoverage } from "@/lib/payment-coverage";
import PrintButton from "./print-button";

type PatientRow = { id: number; name: string; phone: string; email: string; profilePhoto: string; notes: string };
type PackageRow = { id: number; patientId: number; name: string; totalSessions: number; totalAmountCents: number; paidAmountCents: number; paymentStatus: string; purchasedAt: string; paymentDueDate: string | null; status: string };
type SessionRow = { id: number; patientId: number; packageId: number | null; sessionKind: "package" | "standalone"; standaloneAmountCents: number; standalonePaidCents: number; standalonePaymentMethod: string; standaloneDueDate: string | null; sessionValueCents: number; coveredAmountCents: number; outstandingAmountCents: number; paymentStatus: "Paga" | "Pendente" | "Vencida" | "Sem cobrança"; isPartialPayment: boolean; paymentDueDate: string | null; performedAt: string; procedureType: string; measurementIn: string; measurementOut: string; occurrences: string; notes: string };
type PaymentRow = { id: number; patientId: number; packageId: number; amountCents: number; method: string; paidAt: string; notes: string };
type ReportData = { patients: PatientRow[]; packages: PackageRow[]; sessions: SessionRow[]; payments: PaymentRow[] };

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const dateBR = (value?: string | Date | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : "—";

export default function PatientReportPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/clinic", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as ReportData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar o relatório.");
      if (active) setData(result);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o relatório.");
    });
    return () => { active = false; };
  }, []);

  if (error) return <ReportMessage title="Não foi possível abrir o relatório" text={error} />;
  if (!data) return <ReportMessage title="Preparando relatório" text="Carregando os dados atualizados do paciente…" />;
  const patient = data.patients.find((item) => Number(item.id) === id);
  if (!patient) return <ReportMessage title="Paciente não encontrado" text="Volte ao sistema e abra novamente o prontuário desejado." />;
  const packages = data.packages.filter((item) => Number(item.patientId) === id);
  const sessions = data.sessions.filter((item) => Number(item.patientId) === id);
  const payments = data.payments.filter((item) => Number(item.patientId) === id);
  const coverage = calculateSessionCoverage(
    packages.map((pkg) => ({ id: Number(pkg.id), totalSessions: Number(pkg.totalSessions), totalAmountCents: Number(pkg.totalAmountCents), paidAmountCents: Number(pkg.paidAmountCents), paymentDueDate: pkg.paymentDueDate })),
    sessions.filter((session) => session.packageId !== null).map((session) => ({ id: Number(session.id), packageId: Number(session.packageId), performedAt: session.performedAt })),
  );
  sessions.filter((session) => session.packageId === null).forEach((session) => coverage.set(session.id, { sessionValueCents: session.sessionValueCents, coveredAmountCents: session.coveredAmountCents, outstandingAmountCents: session.outstandingAmountCents, paymentStatus: session.paymentStatus, isPartialPayment: session.isPartialPayment, paymentDueDate: session.paymentDueDate }));
  const packageName = (packageId: number | null) => packageId === null ? "Sessão avulsa" : packages.find((item) => item.id === packageId)?.name || "Pacote";
  const standaloneSessions = sessions.filter((session) => session.packageId === null);
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amountCents), 0) + standaloneSessions.reduce((sum, item) => sum + Number(item.coveredAmountCents), 0);
  const totalContracted = packages.reduce((sum, item) => sum + Number(item.totalAmountCents), 0) + standaloneSessions.reduce((sum, item) => sum + Number(item.sessionValueCents), 0);
  const chronologicalSessions = [...sessions].sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id - b.id);
  const sessionPosition = new Map(chronologicalSessions.map((session, index) => [session.id, index]));
  const sessionGroups = sessions.reduce<{ cycle: number; sessions: SessionRow[] }[]>((groups, session) => { const position = sessionPosition.get(session.id) || 0; const cycle = Math.floor(position / 5) + 1; const current = groups.at(-1); if (current?.cycle === cycle) current.sessions.push(session); else groups.push({ cycle, sessions: [session] }); return groups; }, []);
  return <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-[#17231f] print:bg-white print:p-0">
    <div className="mx-auto max-w-4xl rounded-[28px] border bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5 print:hidden"><Link href="/" className="text-sm font-medium text-[#08684e] hover:underline">← Voltar ao sistema</Link><PrintButton /></div>
      <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-[#07533f] pb-6"><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#087052]">Clínica Essência</p><h1 className="mt-2 font-serif text-3xl font-semibold">Relatório do paciente</h1><p className="mt-1 text-sm text-[#6f7d75]">Histórico de sessões, pacotes e pagamentos</p></div><div className="text-right text-sm"><strong className="block">Dra. Maria Carolini</strong><span className="text-[#758179]">Emitido em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</span></div></header>
      <section className="mt-7 flex items-center gap-4 rounded-2xl bg-[#eef6f2] p-5">{patient.profilePhoto && <span style={{ backgroundImage: `url(${patient.profilePhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} className="size-16 shrink-0 rounded-full border-2 border-white shadow-sm" />}<div><h2 className="text-2xl font-semibold">{patient.name}</h2><p className="mt-1 text-sm text-[#5d7066]">{patient.phone || "Sem telefone"}{patient.email ? ` · ${patient.email}` : ""}</p>{patient.notes && <p className="mt-3 text-sm"><strong>Observações gerais:</strong> {patient.notes}</p>}</div></section>
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Sessões realizadas" value={String(sessions.length)} /><Metric label="Pacotes" value={String(packages.length)} /><Metric label="Total pago" value={money(totalPaid)} /><Metric label="Valor pendente" value={money(Math.max(0, totalContracted - totalPaid))} /></section>
      <section className="mt-9"><Title>Pacotes</Title><p className="mt-1 text-sm text-[#758179]">Cada pacote apresenta suas cinco sessões e as respectivas datas.</p><div className="mt-3 grid gap-4">{packages.map((pkg) => {
        const financialStatus = Number(pkg.totalAmountCents) === 0 ? "Sem cobrança" : Number(pkg.paidAmountCents) >= Number(pkg.totalAmountCents) ? "Pago" : pkg.paymentDueDate && String(pkg.paymentDueDate).slice(0, 10) < new Date().toISOString().slice(0, 10) ? "Vencido" : "Pendente";
        const packageSessions = sessions.filter((item) => Number(item.packageId) === Number(pkg.id)).sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.id - b.id);
        return <article key={pkg.id} className="break-inside-avoid overflow-hidden rounded-xl border">
          <div className="grid gap-4 bg-[#f8faf9] p-4 text-sm sm:grid-cols-4 print:grid-cols-4">
            <div><span className="block text-[11px] font-semibold uppercase tracking-wide text-[#748179]">Pacote</span><strong className="mt-1 block">{pkg.name}</strong><span className="text-xs text-[#748179]">{pkg.status}</span></div>
            <div><span className="block text-[11px] font-semibold uppercase tracking-wide text-[#748179]">Contratação / vencimento</span><strong className="mt-1 block">{dateBR(pkg.purchasedAt)}</strong><span className="text-xs text-[#748179]">Vence: {dateBR(pkg.paymentDueDate)}</span></div>
            <div><span className="block text-[11px] font-semibold uppercase tracking-wide text-[#748179]">Sessões realizadas</span><strong className="mt-1 block">{packageSessions.length} de 5</strong></div>
            <div><span className="block text-[11px] font-semibold uppercase tracking-wide text-[#748179]">Pagamento</span><strong className="mt-1 block">{money(pkg.paidAmountCents)} de {money(pkg.totalAmountCents)}</strong><span className="text-xs font-semibold text-[#748179]">{financialStatus}</span></div>
          </div>
          <div className="border-t p-4"><div className="mb-3 flex items-center justify-between gap-3"><strong className="text-sm text-[#07533f]">Sessões deste pacote</strong><span className="text-xs text-[#748179]">1ª a 5ª sessão</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5 print:grid-cols-5">{Array.from({ length: 5 }, (_, index) => { const session = packageSessions[index]; return <div key={index} className={`rounded-lg border px-3 py-2 ${session ? "border-[#bfd9cc] bg-[#eef7f2]" : "border-dashed bg-[#fafbfa]"}`}><strong className={`block text-sm ${session ? "text-[#07533f]" : "text-[#87938d]"}`}>{index + 1}ª sessão</strong><span className={`mt-1 block text-xs ${session ? "font-semibold text-[#355f4e]" : "text-[#929d97]"}`}>{session ? dateBR(session.performedAt) : "Não realizada"}</span></div>; })}</div></div>
        </article>;
      })}{!packages.length && <p className="rounded-xl border p-5 text-center text-[#758179]">Nenhum pacote cadastrado.</p>}</div></section>
      <section className="mt-9"><Title>Histórico de sessões</Title><p className="mt-1 text-sm text-[#758179]">Organizado em ciclos de cinco sessões.</p><div className="mt-3 grid gap-4">{sessionGroups.map((group) => <div key={group.cycle} className="break-inside-avoid"><div className="mb-2 flex items-center justify-between rounded-xl border border-[#cfe2d8] bg-[#eef7f2] px-4 py-2 text-[#07533f]"><strong className="text-sm uppercase tracking-wider">Ciclo {group.cycle}</strong><span className="text-xs text-[#678075]">Sessões de 1 a 5</span></div><div className="grid gap-3">{group.sessions.map((session) => { const payment = coverage.get(Number(session.id)); const position = sessionPosition.get(session.id) || 0; const sessionNumber = position % 5 + 1; return <article key={session.id} className="break-inside-avoid rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><strong>{sessionNumber}ª sessão · {session.procedureType || "Atendimento"}</strong><p className="text-xs text-[#758179]">{packageName(session.packageId)}</p></div><div className="text-right"><strong className="block text-sm text-[#087052]">{dateBR(session.performedAt)}</strong><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${payment?.paymentStatus === "Paga" ? "bg-emerald-100 text-emerald-800" : payment?.paymentStatus === "Vencida" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{payment?.paymentStatus || "Pendente"}{payment?.isPartialPayment ? " · parcial" : ""}</span></div></div>{payment && <p className="mt-3 rounded-lg bg-[#f4f7f5] p-2 text-sm"><strong>Pagamento da sessão:</strong> {money(payment.coveredAmountCents)} de {money(payment.sessionValueCents)}{payment.outstandingAmountCents > 0 ? ` · falta ${money(payment.outstandingAmountCents)}` : ""} · vencimento {dateBR(payment.paymentDueDate)}</p>}{(session.measurementIn || session.measurementOut) && <p className="mt-3 text-sm"><strong>Medidas:</strong> entrada {session.measurementIn || "—"} · saída {session.measurementOut || "—"}</p>}{session.notes && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Evolução e observações:</strong> {session.notes}</p>}{session.occurrences && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-sm"><strong>Intercorrências:</strong> {session.occurrences}</p>}</article>; })}</div></div>)}{!sessions.length && <p className="rounded-xl border p-5 text-center text-[#758179]">Nenhuma sessão registrada.</p>}</div></section>
      <section className="mt-9"><Title>Pagamentos</Title><div className="mt-3 overflow-hidden rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-[#f4f7f5] text-xs uppercase text-[#6f7d75]"><tr><th className="p-3">Data</th><th className="p-3">Pacote</th><th className="p-3">Forma / observação</th><th className="p-3 text-right">Valor</th></tr></thead><tbody className="divide-y">{payments.map((payment) => <tr key={`payment-${payment.id}`}><td className="p-3">{dateBR(payment.paidAt)}</td><td className="p-3">{packageName(payment.packageId)}</td><td className="p-3">{payment.method}{payment.notes && <span className="block text-xs text-[#758179]">{payment.notes}</span>}</td><td className="p-3 text-right font-semibold">{money(payment.amountCents)}</td></tr>)}{standaloneSessions.filter((session) => session.coveredAmountCents > 0).map((session) => <tr key={`standalone-${session.id}`}><td className="p-3">{dateBR(session.performedAt)}</td><td className="p-3">Sessão avulsa</td><td className="p-3">{session.standalonePaymentMethod}</td><td className="p-3 text-right font-semibold">{money(session.coveredAmountCents)}</td></tr>)}{!payments.length && !standaloneSessions.some((session) => session.coveredAmountCents > 0) && <tr><td colSpan={4} className="p-5 text-center text-[#758179]">Nenhum pagamento registrado.</td></tr>}</tbody></table></div></section>
      <footer className="mt-10 border-t pt-5 text-xs text-[#77847c]">Documento gerado pelo sistema Clínica Essência. As informações refletem os registros cadastrados até a data da emissão.</footer>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-3"><p className="text-xs text-[#758179]">{label}</p><strong className="mt-1 block">{value}</strong></div>; }
function Title({ children }: { children: React.ReactNode }) { return <h2 className="font-serif text-2xl font-semibold">{children}</h2>; }
function ReportMessage({ title, text }: { title: string; text: string }) { return <main className="grid min-h-screen place-items-center bg-[#f4f7f5] p-5 text-[#17231f]"><section className="w-full max-w-md rounded-[24px] border bg-white p-7 text-center shadow-sm"><h1 className="font-serif text-2xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-relaxed text-[#6f7d75]">{text}</p><Link href="/" className="mt-6 inline-flex h-10 items-center rounded-xl bg-[#08684e] px-4 text-sm font-medium text-white">Voltar ao sistema</Link></section></main>; }
