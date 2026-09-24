export type PackageForCoverage = {
  id: number;
  totalSessions: number;
  totalAmountCents: number;
  paidAmountCents: number;
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
  paymentStatus: "Paga" | "Parcial" | "Pendente";
};

/**
 * Distribui o valor pago nas sessões mais antigas do pacote. A regra mantém
 * pagamentos parciais visíveis e deixa qualquer saldo excedente como crédito
 * para sessões futuras, sem impedir novos atendimentos.
 */
export function calculateSessionCoverage(packages: PackageForCoverage[], sessions: SessionForCoverage[]) {
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
      const paymentStatus = sessionValueCents === 0 || coveredAmountCents >= sessionValueCents
        ? "Paga"
        : coveredAmountCents > 0
          ? "Parcial"
          : "Pendente";
      coverage.set(session.id, { sessionValueCents, coveredAmountCents, outstandingAmountCents, paymentStatus });
      credit = Math.max(0, credit - coveredAmountCents);
    });
  }

  return coverage;
}
