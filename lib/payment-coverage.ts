export type PackageForCoverage = {
  id: number;
  totalSessions: number;
  totalAmountCents: number;
  paidAmountCents: number;
  paymentDueDate?: string | Date | null;
};

export type SessionForCoverage = {
  id: number;
  packageId: number;
  performedAt: string | Date;
};

export type SessionCoverage = {
  sessionValueCents: number;
  coveredAmountCents: number;
  outstandingAmountCents: number;
  paymentStatus: "Paga" | "Pendente" | "Vencida";
  isPartialPayment: boolean;
  paymentDueDate: string | null;
};

/**
 * Distribui o valor pago nas sessões mais antigas do pacote. A regra mantém
 * pagamentos parciais visíveis e deixa qualquer saldo excedente como crédito
 * para sessões futuras, sem impedir novos atendimentos.
 */
export function calculateSessionCoverage(packages: PackageForCoverage[], sessions: SessionForCoverage[], todayKey = new Date().toISOString().slice(0, 10)) {
  const coverage = new Map<number, SessionCoverage>();

  for (const pkg of packages) {
    const packageSessions = sessions
      .filter((session) => Number(session.packageId) === Number(pkg.id))
      .sort((a, b) => String(a.performedAt).localeCompare(String(b.performedAt)) || a.id - b.id);
    const totalSessions = Math.max(1, Number(pkg.totalSessions));
    const totalAmount = Math.max(0, Number(pkg.totalAmountCents));
    const baseValue = Math.floor(totalAmount / totalSessions);
    const extraCents = totalAmount % totalSessions;
    let credit = Math.max(0, Number(pkg.paidAmountCents));

    packageSessions.forEach((session, index) => {
      const sessionValueCents = baseValue + (index < extraCents ? 1 : 0);
      const coveredAmountCents = Math.min(credit, sessionValueCents);
      const outstandingAmountCents = Math.max(0, sessionValueCents - coveredAmountCents);
      const dueDate = pkg.paymentDueDate ? String(pkg.paymentDueDate).slice(0, 10) : "";
      const paymentStatus = sessionValueCents === 0 || coveredAmountCents >= sessionValueCents
        ? "Paga"
        : dueDate && dueDate < todayKey
          ? "Vencida"
          : "Pendente";
      coverage.set(session.id, { sessionValueCents, coveredAmountCents, outstandingAmountCents, paymentStatus, isPartialPayment: coveredAmountCents > 0 && outstandingAmountCents > 0, paymentDueDate: dueDate || null });
      credit = Math.max(0, credit - coveredAmountCents);
    });
  }

  return coverage;
}
