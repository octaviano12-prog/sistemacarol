import { createHash } from "node:crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureSchema, getPool, rows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ownerFrom = (request: Request) => request.headers.get("x-clinic-owner") || process.env.CLINIC_OWNER_ID || "clinica-essencia";

const allowedTypes: Record<string, { extensions: string[]; signature: (bytes: Uint8Array) => boolean }> = {
  "application/pdf": { extensions: ["pdf"], signature: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  "image/jpeg": { extensions: ["jpg", "jpeg"], signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { extensions: ["png"], signature: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": { extensions: ["webp"], signature: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  "application/msword": { extensions: ["doc"], signature: (b) => [0xd0, 0xcf, 0x11, 0xe0].every((value, index) => b[index] === value) },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { extensions: ["docx"], signature: (b) => b[0] === 0x50 && b[1] === 0x4b },
};

function safeName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "documento").slice(0, 255);
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    const form = await request.formData();
    const patientId = Number(form.get("patientId"));
    const file = form.get("file");
    const category = String(form.get("category") || "Documento").trim().slice(0, 80) || "Documento";
    if (!patientId || !(file instanceof File)) return Response.json({ error: "Escolha um arquivo válido." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_SIZE) return Response.json({ error: "O documento deve ter no máximo 8 MB." }, { status: 400 });
    const rule = allowedTypes[file.type];
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!rule || !rule.extensions.includes(extension)) return Response.json({ error: "Envie um arquivo PDF, JPG, PNG, WEBP, DOC ou DOCX." }, { status: 400 });
    const patient = await rows<(RowDataPacket & { id: number })[]>("SELECT id FROM patients WHERE id = ? AND owner_id = ? LIMIT 1", [patientId, ownerId]);
    if (!patient.length) return Response.json({ error: "Paciente não encontrado." }, { status: 404 });
    const content = Buffer.from(await file.arrayBuffer());
    if (!rule.signature(content)) return Response.json({ error: "O conteúdo do arquivo não corresponde ao formato informado." }, { status: 400 });
    const checksum = createHash("sha256").update(content).digest("hex");
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [created] = await connection.execute<ResultSetHeader>(
        "INSERT INTO patient_documents (owner_id, patient_id, name, category, mime_type, size_bytes, checksum_sha256, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ownerId, patientId, safeName(file.name), category, file.type, content.length, checksum, content],
      );
      await connection.execute("INSERT INTO audit_logs (owner_id, entity_type, entity_id, action, details) VALUES (?, 'document', ?, 'created', ?)", [ownerId, created.insertId, `Documento anexado ao paciente ${patientId}: ${safeName(file.name)}`]);
      await connection.commit();
      return Response.json({ ok: true, id: created.insertId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Não foi possível salvar o documento. Tente novamente." }, { status: 500 });
  }
}
