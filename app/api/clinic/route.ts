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
        await connection.execute("INSERT INTO sessions (owner_id, patient_id, package_id, performed_at, notes) VALUES (?, ?, ?, ?, ?)", [ownerId, patientIds[packageIndex], packageIds[packageIndex], `2026-09-${String(18 - index).padStart(2, "0")}`, index === 0 ? "Sessão concluída normalmente" : ""]);
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
  for (const key of ["createdAt", "purchasedAt", "lastPaymentAt", "performedAt", "paidAt", "scheduledAt"]) {
    const value = result[key];
    if (value instanceof Date) result[key] = value.toISOString().slice(0, key === "scheduledAt" ? 16 : 10);
  }
  return result;
}

async function loadClinic(ownerId: string) {
  const patientRows = await rows<RowDataPacket[]>("SELECT id, name, phone, email, birth_date AS birthDate, notes, active, created_at AS createdAt FROM patients WHERE owner_id = ? ORDER BY name", [ownerId]);
  const packageRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, name, total_sessions AS totalSessions, total_amount_cents AS totalAmountCents, paid_amount_cents AS paidAmountCents, payment_method AS paymentMethod, payment_status AS paymentStatus, purchased_at AS purchasedAt, last_payment_at AS lastPaymentAt, status, created_at AS createdAt FROM packages WHERE owner_id = ? ORDER BY purchased_at DESC, id DESC", [ownerId]);
  const sessionRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, performed_at AS performedAt, notes, created_at AS createdAt FROM sessions WHERE owner_id = ? ORDER BY performed_at DESC, id DESC", [ownerId]);
  const paymentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, package_id AS packageId, amount_cents AS amountCents, method, paid_at AS paidAt, notes, created_at AS createdAt FROM payments WHERE owner_id = ? ORDER BY paid_at DESC, id DESC", [ownerId]);
  const appointmentRows = await rows<RowDataPacket[]>("SELECT id, patient_id AS patientId, scheduled_at AS scheduledAt, duration_minutes AS durationMinutes, status, notes, created_at AS createdAt FROM appointments WHERE owner_id = ? ORDER BY scheduled_at", [ownerId]);
  return { patients: patientRows.map(mapDates), packages: packageRows.map(mapDates), sessions: sessionRows.map(mapDates), payments: paymentRows.map(mapDates), appointments: appointmentRows.map(mapDates) };
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    await seedIfEmpty(ownerId);
    return Response.json(await loadClinic(ownerId));
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
      await pool.execute("INSERT INTO packages (owner_id, patient_id, name, total_sessions, total_amount_cents, paid_amount_cents, payment_method, payment_status, purchased_at, last_payment_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [ownerId, patientId, String(body.name || `Pacote de ${totalSessions} sessões`), totalSessions, total, paid, String(body.paymentMethod || "Não informado"), paid <= 0 ? "Pendente" : paid >= total ? "Pago" : "Parcial", String(body.purchasedAt || today()), paid > 0 ? String(body.purchasedAt || today()) : null]);
    } else if (action === "session.create") {
      const packageId = Number(body.packageId);
      const packages = await rows<(RowDataPacket & { id: number; patientId: number; totalSessions: number })[]>("SELECT id, patient_id AS patientId, total_sessions AS totalSessions FROM packages WHERE id = ? AND owner_id = ? LIMIT 1", [packageId, ownerId]);
      if (!packages.length) return Response.json({ error: "Pacote não encontrado." }, { status: 404 });
      const count = await rows<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM sessions WHERE package_id = ? AND owner_id = ?", [packageId, ownerId]);
      if (count[0].total >= packages[0].totalSessions) return Response.json({ error: "Este pacote não possui sessões disponíveis." }, { status: 400 });
      await pool.execute("INSERT INTO sessions (owner_id, patient_id, package_id, performed_at, notes) VALUES (?, ?, ?, ?, ?)", [ownerId, packages[0].patientId, packageId, String(body.performedAt || today()), String(body.notes || "")]);
      if (count[0].total + 1 >= packages[0].totalSessions) await pool.execute("UPDATE packages SET status = 'Concluído' WHERE id = ? AND owner_id = ?", [packageId, ownerId]);
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
    } else return Response.json({ error: "Ação inválida." }, { status: 400 });
    return Response.json(await loadClinic(ownerId));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Não foi possível salvar. Tente novamente." }, { status: 500 });
  }
}
