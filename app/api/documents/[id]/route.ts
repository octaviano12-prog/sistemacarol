import { RowDataPacket } from "mysql2";
import { ensureSchema, getPool, rows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ownerFrom = (request: Request) => request.headers.get("x-clinic-owner") || process.env.CLINIC_OWNER_ID || "clinica-essencia";
const safeDownloadName = (value: string) => value.replace(/[\r\n"\\]/g, "_");

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    const { id } = await context.params;
    const documents = await rows<(RowDataPacket & { name: string; mimeType: string; content: Buffer })[]>(
      "SELECT name, mime_type AS mimeType, content FROM patient_documents WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1",
      [Number(id), ownerId],
    );
    if (!documents.length) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
    const document = documents[0];
    const disposition = document.mimeType === "application/pdf" || document.mimeType.startsWith("image/") ? "inline" : "attachment";
    return new Response(new Uint8Array(document.content), { headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(document.content.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeDownloadName(document.name))}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Não foi possível abrir o documento." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema();
    const ownerId = ownerFrom(request);
    const { id } = await context.params;
    const documentId = Number(id);
    const documents = await rows<(RowDataPacket & { name: string })[]>("SELECT name FROM patient_documents WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1", [documentId, ownerId]);
    if (!documents.length) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE patient_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?", [documentId, ownerId]);
      await connection.execute("INSERT INTO audit_logs (owner_id, entity_type, entity_id, action, details) VALUES (?, 'document', ?, 'archived', ?)", [ownerId, documentId, `Documento arquivado: ${documents[0].name}`]);
      await connection.commit();
      return Response.json({ ok: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Não foi possível remover o documento." }, { status: 500 });
  }
}
