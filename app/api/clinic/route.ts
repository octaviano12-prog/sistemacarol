import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureSchema, getPool, rows } from "@/lib/db";
import { calculateSessionCoverage } from "@/lib/payment-coverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdRow = RowDataPacket & { id: number };
const today = () => new Date().toISOString().slice(0, 10);
const ownerFrom = (request: Request) => request.headers.get("x-clinic-owner") || process.env.CLINIC_OWNER_ID || "clinica-essencia";
function addWeeksToSqlDateTime(value: string, weeks: number) {
  const [date, time = "00:00"] = value.split(" ");
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + weeks * 7);
  return `${result.toISOString().slice(0, 10)} ${time}`;
}
function appointmentDateTimeBR(value: string) {
  const [date, time = ""] = value.split(" ");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}${time ? ` às ${time.slice(0, 5)}` : ""}`;
}
function validProfilePhoto(value: unknown) {
  const photo = String(value || "");
  if (!photo) return null;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > 1_500_000) throw new Error("A foto do paciente é inválida ou muito grande.");
  return photo;
}

async function removeLegacyDemoData(ownerId: string) {
  const demoEmails = ["mariana@email.com", "lucas@email.com", "camila@email.com", "rafael@email.com"];
  const placeholders = demoEmails.map(() => "?").join(", ");
  const demoPatients = await rows<IdRow[]>(`SELECT id FROM patients WHERE owner_id = ? AND email IN (${placeholders})`, [ownerId, ...demoEmails]);
  if (!demoPatients.length) return;
  const patientIds = demoPatients.map((patient) => patient.id);
  const idPlaceholders = patientIds.map(() => "?").join(", ");
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`DELETE al FROM audit_logs al INNER JOIN sessions s ON s.id = al.entity_id AND al.entity_type = 'session' WHERE s.owner_id = ? AND s.patient_id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
    await connection.execute(`DELETE FROM appointments WHERE owner_id = ? AND patient_id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
    await connection.execute(`DELETE FROM payments WHERE owner_id = ? AND patient_id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
    await connection.execute(`DELETE FROM sessions WHERE owner_id = ? AND patient_id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
    await connection.execute(`DELETE FROM packages WHERE owner_id = ? AND patient_id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
    await connection.execute(`DELETE FROM patients WHERE owner_id = ? AND id IN (${idPlaceholders})`, [ownerId, ...patientIds]);
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
  for (const key of ["createdAt", "updatedAt", "voidedAt", "purchasedAt", "lastPaymentAt", "paymentDueDate", "performedAt", "paidAt", "scheduledAt"]) {
    const value = result[key];
    if (value instanceof Date) result[key] = value.toISOString().slice(0, key === "scheduledAt" ? 16 : 10);
  }
  return result;
}

async function loadClinic(ownerId: string) {
  const patientRows = await rows<RowDataPacket[]>("SELECT id, name, phone, email, COALESCE(profile_photo, '') AS profilePhoto, birth_date AS birthDate, notes, active, created_at AS createdAt FROM patients WHERE owner_id = ? ORDER BY name", [ownerId]);
  const packageRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, name, total_sessions AS totalSessions, total_amount_cents AS totalAmountCents, paid_amount_cents AS paidAmountCents, payment_method AS paymentMethod, payment_status AS paymentStatus, purchased_at AS purchasedAt, last_payment_at AS lastPaymentAt, payment_due_date AS paymentDueDate, status, created_at AS createdAt FROM packages WHERE owner_id = ? ORDER BY purchased_at DESC, id DESC", [ownerId]);
  const sessionRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, performed_at AS performedAt, procedure_type AS procedureType, measurement_in AS measurementIn, measurement_out AS measurementOut, COALESCE(occurrences, '') AS occurrences, notes, updated_at AS updatedAt, created_at AS createdAt FROM sessions WHERE owner_id = ? AND voided_at IS NULL ORDER BY performed_at DESC, id DESC", [ownerId]);
  const paymentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, amount_cents AS amountCents, method, paid_at AS paidAt, notes, created_at AS createdAt FROM payments WHERE owner_id = ? ORDER BY paid_at DESC, id DESC", [ownerId]);
  const appointmentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, title, scheduled_at AS scheduledAt, duration_minutes AS durationMinutes, is_backup AS isBackup, status, notes, created_at AS createdAt FROM appointments WHERE owner_id = ? ORDER BY scheduled_at", [ownerId]);
  const expenseRows = await rows<RowDataPacket[]>("SELECT id, description, category, amount_cents AS amountCents, paid_at AS paidAt, notes, created_at AS createdAt FROM expenses WHERE owner_id = ? ORDER BY paid_at DESC, id DESC", [ownerId]);
  const mappedPackages = packageRows.map(mapDates);
  const mappedSessions = sessionRows.map(mapDates);
  const coverage = calculateSessionCoverage(
    mappedPackages.map((pkg) => ({ id: Number(pkg.id), totalSessions: Number(pkg.totalSessions), totalAmountCents: Number(pkg.totalAmountCents), paidAmountCents: Number(pkg.paidAmountCents), paymentDueDate: pkg.paymentDueDate ? String(pkg.paymentDueDate) : null })),
    mappedSessions.map((session) => ({ id: Number(session.id), packageId: Number(session.packageId), performedAt: String(session.performedAt) })),
  );
  const sessionsWithCoverage = mappedSessions.map((session) => ({ ...session, ...coverage.get(Number(session.id)) }));
  return { patients: patientRows.map(mapDates), packages: mappedPackages, sessions: sessionsWithCoverage, payments: paymentRows.map(mapDates), appointments: appointmentRows.map(mapDates), expenses: expenseRows.map(mapDates) };
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
    await removeLegacyDemoData(ownerId);
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
      const profilePhoto = validProfilePhoto(body.profilePhoto);
      await pool.execute("INSERT INTO patients (owner_id, name, phone, email, profile_photo, notes) VALUES (?, ?, ?, ?, ?, ?)", [ownerId, name, String(body.phone || ""), String(body.email || ""), profilePhoto, String(body.notes || "")]);
    } else if (action === "package.create") {
      const patientId = Number(body.patientId); const totalSessions = Number(body.totalSessions);
      if (!patientId || totalSessions < 1) return Response.json({ error: "Escolha o paciente e informe as sessões." }, { status: 400 });
      const total = Math.round(Number(body.totalAmount || 0) * 100); const paid = Math.round(Number(body.paidAmount || 0) * 100);
      const purchasedAt = String(body.purchasedAt || today()); const method = String(body.paymentMethod || "Não informado"); const paymentDueDate = body.paymentDueDate ? String(body.paymentDueDate) : null;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [created] = await connection.execute<ResultSetHeader>("INSERT INTO packages (owner_id, patient_id, name, total_sessions, total_amount_cents, paid_amount_cents, payment_method, payment_status, purchased_at, last_payment_at, payment_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, patientId, String(body.name || `Pacote de ${totalSessions} sessões`), totalSessions, total, paid, method, paid <= 0 ? "Pendente" : paid >= total ? "Pago" : "Parcial", purchasedAt, paid > 0 ? purchasedAt : null, paymentDueDate]);
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
    } else if (action === "appointment.create" || action === "appointment.block") {
      const isBlock = action === "appointment.block";
      const allowOverlap = !isBlock && (body.allowOverlap === true || String(body.allowOverlap || "") === "on");
      const patientId = isBlock ? null : Number(body.patientId); const scheduledAt = String(body.scheduledAt || "").replace("T", " ");
      const title = isBlock ? String(body.title || "Compromisso pessoal").trim() : "";
      if ((!isBlock && !patientId) || !scheduledAt || (isBlock && !title)) return Response.json({ error: isBlock ? "Informe o compromisso, a data e o horário." : "Escolha o paciente e a data." }, { status: 400 });
      const requestedDuration = isBlock ? Number(body.durationHours || 1) * 60 : Number(body.durationMinutes || 50);
      const requestedRepeatWeeks = Number(body.repeatWeeks || 1);
      const durationMinutes = Number.isFinite(requestedDuration) ? Math.min(720, Math.max(10, Math.trunc(requestedDuration))) : 50;
      const repeatWeeks = Number.isFinite(requestedRepeatWeeks) ? Math.min(52, Math.max(1, Math.trunc(requestedRepeatWeeks))) : 1;
      const occurrences = Array.from({ length: repeatWeeks }, (_, index) => addWeeksToSqlDateTime(scheduledAt, index));
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const occurrence of occurrences) {
          const [conflicts] = await connection.execute<RowDataPacket[]>(`SELECT id, patient_id AS patientId, is_backup AS isBackup FROM appointments
            WHERE owner_id = ? AND status NOT IN ('Cancelado', 'Faltou')
            AND scheduled_at < DATE_ADD(?, INTERVAL ? MINUTE)
            AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) > ? FOR UPDATE`, [ownerId, occurrence, durationMinutes, occurrence]);
          const hasPersonalBlock = conflicts.some((conflict) => conflict.patientId === null);
          const hasBackup = conflicts.some((conflict) => Boolean(conflict.isBackup));
          const onlyReservedSlot = conflicts.length === 1 && Boolean(conflicts[0].isBackup);
          const unavailable = isBlock ? conflicts.length > 0 : hasPersonalBlock || (!allowOverlap && conflicts.length > 0 && !onlyReservedSlot) || (allowOverlap && (conflicts.length >= 2 || hasBackup));
          if (unavailable) {
            await connection.rollback();
            const reason = hasPersonalBlock ? "está bloqueado por um compromisso pessoal" : conflicts.length >= 2 ? "já tem dois pacientes" : "já está ocupado";
            return Response.json({ error: `O horário de ${appointmentDateTimeBR(occurrence)} ${reason}. Nenhum agendamento da repetição foi criado.` }, { status: 409 });
          }
        }
        for (const occurrence of occurrences) await connection.execute("INSERT INTO appointments (owner_id, patient_id, title, scheduled_at, duration_minutes, is_backup, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, patientId, title, occurrence, durationMinutes, allowOverlap, isBlock ? "Bloqueado" : "Agendado", String(body.notes || "")]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else if (action === "appointment.update") {
      const id = Number(body.id); const scheduledAt = String(body.scheduledAt || "").replace("T", " ");
      const found = await rows<(RowDataPacket & { patientId: number | null; isBackup: boolean })[]>("SELECT patient_id AS patientId, is_backup AS isBackup FROM appointments WHERE id = ? AND owner_id = ? LIMIT 1", [id, ownerId]);
      if (!found.length || !scheduledAt) return Response.json({ error: "Agendamento inválido." }, { status: 400 });
      const patientId = found[0].patientId;
      const requestedDuration = patientId === null ? Number(body.durationHours || 1) * 60 : Number(body.durationMinutes || 50);
      const durationMinutes = Number.isFinite(requestedDuration) ? Math.min(720, Math.max(10, Math.trunc(requestedDuration))) : 50;
      const title = patientId === null ? String(body.title || "Compromisso pessoal").trim() : "";
      const conflicts = await rows<RowDataPacket[]>(`SELECT id, patient_id AS patientId, is_backup AS isBackup FROM appointments
        WHERE owner_id = ? AND id <> ? AND status NOT IN ('Cancelado', 'Faltou')
        AND scheduled_at < DATE_ADD(?, INTERVAL ? MINUTE)
        AND DATE_ADD(scheduled_at, INTERVAL duration_minutes MINUTE) > ?`, [ownerId, id, scheduledAt, durationMinutes, scheduledAt]);
      const hasPersonalBlock = conflicts.some((conflict) => conflict.patientId === null);
      const regularConflict = conflicts.some((conflict) => !Boolean(conflict.isBackup));
      const unavailable = patientId === null ? conflicts.length > 0 : hasPersonalBlock || conflicts.length >= 2 || (!found[0].isBackup && regularConflict);
      if (unavailable) return Response.json({ error: hasPersonalBlock ? "O novo horário está bloqueado por um compromisso pessoal." : conflicts.length >= 2 ? "Este horário já tem dois pacientes." : "O novo horário já está ocupado. Escolha outro horário na agenda." }, { status: 409 });
      await pool.execute("UPDATE appointments SET title = ?, scheduled_at = ?, duration_minutes = ?, notes = ? WHERE id = ? AND owner_id = ?", [title, scheduledAt, durationMinutes, String(body.notes || ""), id, ownerId]);
    } else if (action === "patient.update") {
      const id = Number(body.id); const name = String(body.name || "").trim();
      if (!id || !name) return Response.json({ error: "Paciente inválido." }, { status: 400 });
      const profilePhoto = validProfilePhoto(body.profilePhoto);
      await pool.execute("UPDATE patients SET name = ?, phone = ?, email = ?, profile_photo = ?, notes = ? WHERE id = ? AND owner_id = ?", [name, String(body.phone || ""), String(body.email || ""), profilePhoto, String(body.notes || ""), id, ownerId]);
    } else if (action === "package.dueDate") {
      const id = Number(body.id); const paymentDueDate = String(body.paymentDueDate || "");
      if (!id || !paymentDueDate) return Response.json({ error: "Informe uma data de vencimento válida." }, { status: 400 });
      await pool.execute("UPDATE packages SET payment_due_date = ? WHERE id = ? AND owner_id = ?", [paymentDueDate, id, ownerId]);
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
