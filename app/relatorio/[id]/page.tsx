import Link from "next/link";
import { notFound } from "next/navigation";
import { RowDataPacket } from "mysql2";
import { ensureSchema, rows } from "@/lib/db";
import { calculateSessionCoverage } from "@/lib/payment-coverage";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

type PatientRow = RowDataPacket & { id: number; name: string; phone: string; email: string; notes: string };
type PackageRow = RowDataPacket & { id: number; name: string; totalSessions: number; totalAmountCents: number; paidAmountCents: number; paymentStatus: string; purchasedAt: string | Date; paymentDueDate: string | Date | null; status: string };
type SessionRow = RowDataPacket & { id: number; packageId: number; performedAt: string | Date; procedureType: string; measurementIn: string; measurementOut: string; occurrences: string; notes: string };
type PaymentRow = RowDataPacket & { id: number; packageId: number; amountCents: number; method: string; paidAt: string | Date; notes: string };

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const dateBR = (value?: string | Date | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : "—";

export default async function PatientReportPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureSchema();
  const { id: rawId } = await params;
  const id = Number(rawId);
  const ownerId = process.env.CLINIC_OWNER_ID || "clinica-essencia";
  if (!id) notFound();
  const patients = await rows<PatientRow[]>("SELECT id, name, phone, email, notes FROM patients WHERE id = ? AND owner_id = ? LIMIT 1", [id, ownerId]);
  if (!patients.length) notFound();
  const patient = patients[0];
  const packages = await rows<PackageRow[]>("SELECT id, name, total_sessions AS totalSessions, total_amount_cents AS totalAmountCents, paid_amount_cents AS paidAmountCents, payment_status AS paymentStatus, purchased_at AS purchasedAt, payment_due_date AS paymentDueDate, status FROM packages WHERE patient_id = ? AND owner_id = ? ORDER BY purchased_at DESC, id DESC", [id, ownerId]);
  const sessions = await rows<SessionRow[]>("SELECT id, package_id AS packageId, performed_at AS performedAt, procedure_type AS procedureType, measurement_in AS measurementIn, measurement_out AS measurementOut, COALESCE(occurrences, '') AS occurrences, notes FROM sessions WHERE patient_id = ? AND owner_id = ? AND voided_at IS NULL ORDER BY performed_at DESC, id DESC", [id, ownerId]);
  const payments = await rows<PaymentRow[]>("SELECT id, package_id AS packageId, amount_cents AS amountCents, method, paid_at AS paidAt, notes FROM payments WHERE patient_id = ? AND owner_id = ? ORDER BY paid_at DESC, id DESC", [id, ownerId]);
  const coverage = calculateSessionCoverage(
    packages.map((pkg) => ({ id: Number(pkg.id), totalSessions: Number(pkg.totalSessions), totalAmountCents: Number(pkg.totalAmountCents), paidAmountCents: Number(pkg.paidAmountCents), paymentDueDate: pkg.paymentDueDate })),
    sessions.map((session) => ({ id: Number(session.id), packageId: Number(session.packageId), performedAt: session.performedAt })),
  );
  const packageName = (packageId: number) => packages.find((item) => item.id === packageId)?.name || "Pacote";
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amountCents), 0);
  const totalContracted = packages.reduce((sum, item) => sum + Number(item.totalAmountCents), 0);
  return <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-[#17231f] print:bg-white print:p-0">
    <div className="mx-auto max-w-4xl rounded-[28px] border bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5 print:hidden"><Link href="/" className="text-sm font-medium text-[#08684e] hover:underline">← Voltar ao sistema</Link><PrintButton /></div>
      <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-[#07533f] pb-6"><div><p className="text-sm font-semibold uppercase tracking-[.2em] text-[#087052]">Clínica Essência</p><h1 className="mt-2 font-serif text-3xl font-semibold">Relatório do paciente</h1><p className="mt-1 text-sm text-[#6f7d75]">Histórico de sessões, pacotes e pagamentos</p></div><div className="text-right text-sm"><strong className="block">Dra. Maria Carolini</strong><span className="text-[#758179]">Emitido em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</span></div></header>
      <section className="mt-7 rounded-2xl bg-[#eef6f2] p-5"><h2 className="text-2xl font-semibold">{patient.name}</h2><p className="mt-1 text-sm text-[#5d7066]">{patient.phone || "Sem telefone"}{patient.email ? ` · ${patient.email}` : ""}</p>{patient.notes && <p className="mt-3 text-sm"><strong>Observações gerais:</strong> {patient.notes}</p>}</section>
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Sessões realizadas" value={String(sessions.length)} /><Metric label="Pacotes" value={String(packages.length)} /><Metric label="Total pago" value={money(totalPaid)} /><Metric label="Valor pendente" value={money(Math.max(0, totalContracted - totalPaid))} /></section>
      <section className="mt-9"><Title>Pacotes</Title><div className="mt-3 overflow-hidden rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-[#f4f7f5] text-xs uppercase text-[#6f7d75]"><tr><th className="p-3">Pacote</th><th className="p-3">Contratação / vencimento</th><th className="p-3">Sessões</th><th className="p-3">Pagamento</th></tr></thead><tbody className="divide-y">{packages.map((pkg) => { const financialStatus = Number(pkg.paidAmountCents) >= Number(pkg.totalAmountCents) ? "Pago" : pkg.paymentDueDate && String(pkg.paymentDueDate).slice(0, 10) < new Date().toISOString().slice(0, 10) ? "Vencido" : "Pendente"; return <tr key={pkg.id}><td className="p-3"><strong>{pkg.name}</strong><span className="block text-xs text-[#748179]">{pkg.status}</span></td><td className="p-3">{dateBR(pkg.purchasedAt)}<span className="block text-xs text-[#748179]">Vence: {dateBR(pkg.paymentDueDate)}</span></td><td className="p-3">{sessions.filter((item) => item.packageId === pkg.id).length} de {pkg.totalSessions}</td><td className="p-3">{money(pkg.paidAmountCents)} de {money(pkg.totalAmountCents)}<span className="block text-xs font-semibold text-[#748179]">{financialStatus}</span></td></tr>; })}{!packages.length && <tr><td colSpan={4} className="p-5 text-center text-[#758179]">Nenhum pacote cadastrado.</td></tr>}</tbody></table></div></section>
      <section className="mt-9"><Title>Histórico de sessões</Title><div className="mt-3 grid gap-3">{sessions.map((session, index) => { const payment = coverage.get(Number(session.id)); return <article key={session.id} className="break-inside-avoid rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><strong>{sessions.length - index}ª sessão · {session.procedureType || "Atendimento"}</strong><p className="text-xs text-[#758179]">{packageName(session.packageId)}</p></div><div className="text-right"><strong className="block text-sm text-[#087052]">{dateBR(session.performedAt)}</strong><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${payment?.paymentStatus === "Paga" ? "bg-emerald-100 text-emerald-800" : payment?.paymentStatus === "Vencida" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{payment?.paymentStatus || "Pendente"}{payment?.isPartialPayment ? " · parcial" : ""}</span></div></div>{payment && <p className="mt-3 rounded-lg bg-[#f4f7f5] p-2 text-sm"><strong>Pagamento da sessão:</strong> {money(payment.coveredAmountCents)} de {money(payment.sessionValueCents)}{payment.outstandingAmountCents > 0 ? ` · falta ${money(payment.outstandingAmountCents)}` : ""} · vencimento {dateBR(payment.paymentDueDate)}</p>}{(session.measurementIn || session.measurementOut) && <p className="mt-3 text-sm"><strong>Medidas:</strong> entrada {session.measurementIn || "—"} · saída {session.measurementOut || "—"}</p>}{session.notes && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Evolução e observações:</strong> {session.notes}</p>}{session.occurrences && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-sm"><strong>Intercorrências:</strong> {session.occurrences}</p>}</article>; })}{!sessions.length && <p className="rounded-xl border p-5 text-center text-[#758179]">Nenhuma sessão registrada.</p>}</div></section>
      <section className="mt-9"><Title>Pagamentos</Title><div className="mt-3 overflow-hidden rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-[#f4f7f5] text-xs uppercase text-[#6f7d75]"><tr><th className="p-3">Data</th><th className="p-3">Pacote</th><th className="p-3">Forma / observação</th><th className="p-3 text-right">Valor</th></tr></thead><tbody className="divide-y">{payments.map((payment) => <tr key={payment.id}><td className="p-3">{dateBR(payment.paidAt)}</td><td className="p-3">{packageName(payment.packageId)}</td><td className="p-3">{payment.method}{payment.notes && <span className="block text-xs text-[#758179]">{payment.notes}</span>}</td><td className="p-3 text-right font-semibold">{money(payment.amountCents)}</td></tr>)}{!payments.length && <tr><td colSpan={4} className="p-5 text-center text-[#758179]">Nenhum pagamento registrado.</td></tr>}</tbody></table></div></section>
      <footer className="mt-10 border-t pt-5 text-xs text-[#77847c]">Documento gerado pelo sistema Clínica Essência. As informações refletem os registros cadastrados até a data da emissão.</footer>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border p-3"><p className="text-xs text-[#758179]">{label}</p><strong className="mt-1 block">{value}</strong></div>; }
function Title({ children }: { children: React.ReactNode }) { return <h2 className="font-serif text-2xl font-semibold">{children}</h2>; }
