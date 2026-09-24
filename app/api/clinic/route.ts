import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureSchema, getPool, rows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdRow = RowDataPacket & { id: number };
const today = () => new Date().toISOString().slice(0, 10);
const ownerFrom = (request: Request) => request.headers.get("x-clinic-owner") || process.env.CLINIC_OWNER_ID || "clinica-essencia";

async function seedIfEmpty(ownerId: string) {
  const existing = await rows<IdRow[]>("SELECT id FROM patients WHERE owner_id = ? LIMIT 1", [ownerId]);
  if (existing.length) return;
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const patientSeed = [
      ["Mariana Souza", "(11) 98765-4321", "mariana@email.com", "Fisioterapia ortopédica"],
      ["Lucas Oliveira", "(11) 99812-4477", "lucas@email.com", "Pilates terapêutico"],
      ["Camila Martins", "(11) 97654-1108", "camila@email.com", "Fisioterapia preventiva"],
      ["Rafael Lima", "(11) 96543-8890", "rafael@email.com", "Reabilitação esportiva"],
    ];
    const patientIds: number[] = [];
    for (const [name, phone, email, notes] of patientSeed) {
      const [result] = await connection.execute<ResultSetHeader>("INSERT INTO patients (owner_id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?)", [ownerId, name, phone, email, notes]);
      patientIds.push(result.insertId);
    }
    const packageSeed = [
      [patientIds[0], "Pacote de 5 sessões", 5, 75000, 75000, "Pix", "Pago", "2026-09-18", "2026-09-18"],
      [patientIds[1], "Pacote de 10 sessões", 10, 130000, 65000, "Cartão", "Parcial", "2026-09-12", "2026-09-12"],
      [patientIds[2], "Pacote de 8 sessões", 8, 112000, 112000, "Pix", "Pago", "2026-09-10", "2026-09-10"],
      [patientIds[3], "Pacote de 5 sessões", 5, 70000, 70000, "Dinheiro", "Pago", "2026-09-08", "2026-09-08"],
    ];
    const packageIds: number[] = [];
    for (const pkg of packageSeed) {
      const [result] = await connection.execute<ResultSetHeader>("INSERT INTO packages (owner_id, patient_id, name, total_sessions, total_amount_cents, paid_amount_cents, payment_method, payment_status, purchased_at, last_payment_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, ...pkg]);
      packageIds.push(result.insertId);
    }
    for (let packageIndex = 0; packageIndex < packageIds.length; packageIndex++) {
      for (let index = 0; index < [3, 6, 7, 4][packageIndex]; index++) {
        await connection.execute("INSERT INTO sessions (owner_id, patient_id, package_id, performed_at, procedure_type, measurement_in, measurement_out, occurrences, notes) VALUES (?, ?, ?, ?, ?, '', '', '', ?)", [ownerId, patientIds[packageIndex], packageIds[packageIndex], `2026-09-${String(18 - index).padStart(2, "0")}`, "Fisioterapia", index === 0 ? "Sessão concluída normalmente" : ""]);
      }
      await connection.execute("INSERT INTO payments (owner_id, patient_id, package_id, amount_cents, method, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", [ownerId, patientIds[packageIndex], packageIds[packageIndex], packageSeed[packageIndex][4], packageSeed[packageIndex][5], packageSeed[packageIndex][8], "Pagamento registrado"]);
    }
    for (const [patientIndex, hour] of [[0, "09:00"], [1, "10:30"], [2, "14:00"]] as const) {
      await connection.execute("INSERT INTO appointments (owner_id, patient_id, scheduled_at, duration_minutes, notes) VALUES (?, ?, ?, ?, '')", [ownerId, patientIds[patientIndex], `${today()} ${hour}:00`, 50]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function mapDates(row: Record<string, unknown>) {
  const result = { ...row };
  for (const key of ["createdAt", "updatedAt", "voidedAt", "purchasedAt", "lastPaymentAt", "performedAt", "paidAt", "scheduledAt"]) {
    const value = result[key];
    if (value instanceof Date) result[key] = value.toISOString().slice(0, key === "scheduledAt" ? 16 : 10);
  }
  return result;
}

async function loadClinic(ownerId: string) {
  const patientRows = await rows<RowDataPacket[]>("SELECT id, name, phone, email, birth_date AS birthDate, notes, active, created_at AS createdAt FROM patients WHERE owner_id = ? ORDER BY name", [ownerId]);
  const packageRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, name, total_sessions AS totalSessions, total_amount_cents AS totalAmountCents, paid_amount_cents AS paidAmountCents, payment_method AS paymentMethod, payment_status AS paymentStatus, purchased_at AS purchasedAt, last_payment_at AS lastPaymentAt, status, created_at AS createdAt FROM packages WHERE owner_id = ? ORDER BY purchased_at DESC, id DESC", [ownerId]);
  const sessionRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, performed_at AS performedAt, procedure_type AS procedureType, measurement_in AS measurementIn, measurement_out AS measurementOut, COALESCE(occurrences, '') AS occurrences, notes, updated_at AS updatedAt, created_at AS createdAt FROM sessions WHERE owner_id = ? AND voided_at IS NULL ORDER BY performed_at DESC, id DESC", [ownerId]);
  const paymentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, amount_cents AS amountCents, method, paid_at AS paidAt, notes, created_at AS createdAt FROM payments WHERE owner_id = ? ORDER BY paid_at DESC, id DESC", [ownerId]);
  const appointmentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, scheduled_at AS scheduledAt, duration_minutes AS durationMinutes, status, notes, created_at AS createdAt FROM appointments WHERE owner_id = ? ORDER BY scheduled_at", [ownerId]);
  const expenseRows = await rows<RowDataPacket[]>("SELECT id, description, category, amount_cents AS amountCents, paid_at AS paidAt, notes, created_at AS createdAt FROM expenses WHERE owner_id = ? ORDER BY paid_at DESC, id DESC", [ownerId]);
  return { patients: patientRows.map(mapDates), packages: packageRows.map(mapDates), sessions: sessionRows.map(mapDates), payments: paymentRows.map(mapDates), appointments: appointmentRows.map(mapDates), expenses: expenseRows.map(mapDates) };
}

async function logAction(ownerId: string, entityType: string, entityId: number, action: string, details = "") {
  await getPool().execute("INSERT INTO audit_logs (owner_id, entity_type, entity_id, action, details) VALUES (?, ?, ?, ?, ?)", [ownerId, entityType, entityId, action, details]);
}

async function refreshPackagePayment(packageId: number, ownerId: string) {
  const pool = getPool();
  const totals = await rows<(RowDataPacket & { paid: number; total: number })[]>(
    `SELECT COALESCE(SUM(pay.amount_cents), 0) AS paid, pkg.total_amount_cents AS total
     FROM packages pkg
     LEFT JOIN payments pay ON pay.package_id = pkg.id AND pay.owner_id = pkg.owner_id
     WHERE pkg.id = ? AND pkg.owner_id = ?
     GROUP BY pkg.id, pkg.total_amount_cents`,
    [packageId, ownerId],
  );
  if (!totals.length) return;
  const paid = Number(totals[0].paid);
  const status = paid <= 0 ? "Pendente" : paid >= Number(totals[0].total) ? "Pago" : "Parcial";
  await pool.execute(
    `UPDATE packages SET paid_amount_cents = ?, payment_status = ?,
     last_payment_at = (SELECT MAX(paid_at) FROM payments WHERE package_id = ? AND owner_id = ?)
     WHERE id = ? AND owner_id = ?`,
    [paid, status, packageId, ownerId, packageId, ownerId],
  );
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    if (process.env.SEED_DEMO_DATA === "true") await seedIfEmpty(ownerId);
    const clinic = await loadClinic(ownerId);
    if (new URL(request.url).searchParams.get("export") === "backup") {
      const voidedSessions = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, performed_at AS performedAt, procedure_type AS procedureType, measurement_in AS measurementIn, measurement_out AS measurementOut, COALESCE(occurrences, '') AS occurrences, notes, updated_at AS updatedAt, voided_at AS voidedAt, void_reason AS voidReason, created_at AS createdAt FROM sessions WHERE owner_id = ? AND voided_at IS NOT NULL ORDER BY id", [ownerId]);
      const auditLogs = await rows<RowDataPacket[]>("SELECT entity_type AS entityType, entity_id AS entityId, action, details, created_at AS createdAt FROM audit_logs WHERE owner_id = ? ORDER BY id", [ownerId]);
      const filename = `backup-clinica-${today()}.json`;
      return new Response(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), clinic, voidedSessions: voidedSessions.map(mapDates), auditLogs: auditLogs.map(mapDates) }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
    }
    return Response.json(clinic);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Banco de dados indisponível. Verifique a configuração da Hostinger." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const pool = getPool();
    if (action === "patient.create") {
      const name = String(body.name || "").trim();
      if (!name) return Response.json({ error: "Informe o nome do paciente." }, { status: 400 });
      await pool.execute("INSERT INTO patients (owner_id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?)", [ownerId, name, String(body.phone || ""), String(body.email || ""), String(body.notes || "")]);
    } else if (action === "package.create") {
      const patientId = Number(body.patientId); const totalSessions = Number(body.totalSessions);
      if (!patientId || totalSessions < 1) return Response.json({ error: "Escolha o paciente e informe as sessões." }, { status: 400 });
      const total = Math.round(Number(body.totalAmount || 0) * 100); const paid = Math.round(Number(body.paidAmount || 0) * 100);
      const purchasedAt = String(body.purchasedAt || today()); const method = String(body.paymentMethod || "Não informado");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO packages (owner_id, patient_id, name, total_sessions, total_amount_cents, paid_amount_cents, payment_method, payment_status, purchased_at, last_payment_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, patientId, String(body.name || `Pacote de ${totalSessions} sessões`), totalSessions, total, paid, method, paid <= 0 ? "Pendente" : paid >= total ? "Pago" : "Parcial", purchasedAt, paid > 0 ? purchasedAt : null]);
        if (paid > 0) await connection.execute("INSERT INTO payments (owner_id, patient_id, package_id, amount_cents, method, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", [ownerId, patientId, created.insertId, paid, method, purchasedAt, "Pagamento inicial do pacote"]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } else if (action === "session.create") {
      const packageId = Number(body.packageId);
      const packages = await rows<(RowDataPacket & { id: number; patientId: number; totalSessions: number })[]>("SELECT id, patient_id AS patientId, total_sessions AS totalSessions FROM packages WHERE id = ? AND owner_id = ? LIMIT 1", [packageId, ownerId]);
      if (!packages.length) return Response.json({ error: "Pacote não encontrado." }, { status: 404 });
      const count = await rows<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM sessions WHERE package_id = ? AND owner_id = ? AND voided_at IS NULL", [packageId, ownerId]);
      if (count[0].total >= packages[0].totalSessions) return Response.json({ error: "Este pacote não possui sessões disponíveis." }, { status: 400 });
      const [created] = await pool.execute<ResultSetHeader>("INSERT INTO sessions (owner_id, patient_id, package_id, performed_at, procedure_type, measurement_in, measurement_out, occurrences, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, packages[0].patientId, packageId, String(body.performedAt || today()), String(body.procedureType || ""), String(body.measurementIn || ""), String(body.measurementOut || ""), String(body.occurrences || ""), String(body.notes || "")]);
      await logAction(ownerId, "session", created.insertId, "created");
      if (count[0].total + 1 >= packages[0].totalSessions) await pool.execute("UPDATE packages SET status = 'Concluído' WHERE id = ? AND owner_id = ?", [packageId, ownerId]);
    } else if (action === "session.update") {
      const id = Number(body.id);
      const found = await rows<RowDataPacket[]>("SELECT performed_at AS performedAt, procedure_type AS procedureType, measurement_in AS measurementIn, measurement_out AS measurementOut, COALESCE(occurrences, '') AS occurrences, notes FROM sessions WHERE id = ? AND owner_id = ? AND voided_at IS NULL LIMIT 1", [id, ownerId]);
      if (!found.length) return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
      await pool.execute("UPDATE sessions SET performed_at = ?, procedure_type = ?, measurement_in = ?, measurement_out = ?, occurrences = ?, notes = ? WHERE id = ? AND owner_id = ? AND voided_at IS NULL", [String(body.performedAt || today()), String(body.procedureType || ""), String(body.measurementIn || ""), String(body.measurementOut || ""), String(body.occurrences || ""), String(body.notes || ""), id, ownerId]);
      await logAction(ownerId, "session", id, "updated", JSON.stringify(mapDates(found[0])));
    } else if (action === "payment.create") {
      const packageId = Number(body.packageId); const amountCents = Math.round(Number(body.amount || 0) * 100);
      const packages = await rows<(RowDataPacket & { patientId: number; totalAmountCents: number; paidAmountCents: number })[]>("SELECT patient_id AS patientId, total_amount_cents AS totalAmountCents, paid_amount_cents AS paidAmountCents FROM packages WHERE id = ? AND owner_id = ? LIMIT 1", [packageId, ownerId]);
      if (!packages.length || amountCents <= 0) return Response.json({ error: "Informe um pacote e um valor válido." }, { status: 400 });
      const paidAt = String(body.paidAt || today()); const method = String(body.method || "Pix"); const newPaid = packages[0].paidAmountCents + amountCents;
      await pool.execute("INSERT INTO payments (owner_id, patient_id, package_id, amount_cents, method, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", [ownerId, packages[0].patientId, packageId, amountCents, method, paidAt, String(body.notes || "")]);
      await pool.execute("UPDATE packages SET paid_amount_cents = ?, payment_method = ?, last_payment_at = ?, payment_status = ? WHERE id = ? AND owner_id = ?", [newPaid, method, paidAt, newPaid >= packages[0].totalAmountCents ? "Pago" : "Parcial", packageId, ownerId]);
    } else if (action === "appointment.create") {
      const patientId = Number(body.patientId); const scheduledAt = String(body.scheduledAt || "").replace("T", " ");
      if (!patientId || !scheduledAt) return Response.json({ error: "Escolha o paciente e a data." }, { status: 400 });
      await pool.execute("INSERT INTO appointments (owner_id, patient_id, scheduled_at, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)", [ownerId, patientId, scheduledAt, Number(body.durationMinutes || 50), String(body.notes || "")]);
    } else if (action === "patient.update") {
      const id = Number(body.id); const name = String(body.name || "").trim();
      if (!id || !name) return Response.json({ error: "Paciente inválido." }, { status: 400 });
      await pool.execute("UPDATE patients SET name = ?, phone = ?, email = ?, notes = ? WHERE id = ? AND owner_id = ?", [name, String(body.phone || ""), String(body.email || ""), String(body.notes || ""), id, ownerId]);
    } else if (action === "patient.delete") {
      const id = Number(body.id);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM appointments WHERE patient_id = ? AND owner_id = ?", [id, ownerId]);
        await connection.execute("DELETE FROM payments WHERE patient_id = ? AND owner_id = ?", [id, ownerId]);
        await connection.execute("DELETE FROM sessions WHERE patient_id = ? AND owner_id = ?", [id, ownerId]);
        await connection.execute("DELETE FROM packages WHERE patient_id = ? AND owner_id = ?", [id, ownerId]);
        await connection.execute("DELETE FROM patients WHERE id = ? AND owner_id = ?", [id, ownerId]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } else if (action === "package.delete") {
      const id = Number(body.id);
      await pool.execute("DELETE FROM payments WHERE package_id = ? AND owner_id = ?", [id, ownerId]);
      await pool.execute("DELETE FROM sessions WHERE package_id = ? AND owner_id = ?", [id, ownerId]);
      await pool.execute("DELETE FROM packages WHERE id = ? AND owner_id = ?", [id, ownerId]);
    } else if (action === "session.delete") {
      const id = Number(body.id);
      const found = await rows<(RowDataPacket & { packageId: number })[]>("SELECT package_id AS packageId FROM sessions WHERE id = ? AND owner_id = ?", [id, ownerId]);
      await pool.execute("UPDATE sessions SET voided_at = CURRENT_TIMESTAMP, void_reason = ? WHERE id = ? AND owner_id = ? AND voided_at IS NULL", [String(body.reason || "Registro cancelado pela profissional"), id, ownerId]);
      await logAction(ownerId, "session", id, "voided", String(body.reason || "Registro cancelado pela profissional"));
      if (found.length) await pool.execute("UPDATE packages SET status = 'Em andamento' WHERE id = ? AND owner_id = ?", [found[0].packageId, ownerId]);
    } else if (action === "payment.delete") {
      const id = Number(body.id);
      const found = await rows<(RowDataPacket & { packageId: number })[]>("SELECT package_id AS packageId FROM payments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      await pool.execute("DELETE FROM payments WHERE id = ? AND owner_id = ?", [id, ownerId]);
      if (found.length) await refreshPackagePayment(found[0].packageId, ownerId);
    } else if (action === "appointment.status") {
      const id = Number(body.id); const status = String(body.status || "Agendado");
      await pool.execute("UPDATE appointments SET status = ? WHERE id = ? AND owner_id = ?", [status, id, ownerId]);
    } else if (action === "appointment.delete") {
      await pool.execute("DELETE FROM appointments WHERE id = ? AND owner_id = ?", [Number(body.id), ownerId]);
    } else if (action === "expense.create") {
      const description = String(body.description || "").trim(); const amountCents = Math.round(Number(body.amount || 0) * 100);
      if (!description || amountCents <= 0) return Response.json({ error: "Informe a descrição e um valor válido." }, { status: 400 });
      await pool.execute("INSERT INTO expenses (owner_id, description, category, amount_cents, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?)", [ownerId, description, String(body.category || "Outros"), amountCents, String(body.paidAt || today()), String(body.notes || "")]);
    } else if (action === "expense.delete") {
      await pool.execute("DELETE FROM expenses WHERE id = ? AND owner_id = ?", [Number(body.id), ownerId]);
    } else return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json(await loadClinic(ownerId));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 });
  }
}
