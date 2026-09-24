import mysql, { Pool, RowDataPacket } from "mysql2/promise";

declare global {
  var clinicPool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  global.clinicPool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 6,
    enableKeepAlive: true,
    timezone: "Z",
    decimalNumbers: true,
  });
  return global.clinicPool;
}

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;
  const pool = getPool();
  const statements = [
    `CREATE TABLE IF NOT EXISTS patients (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      name VARCHAR(191) NOT NULL,
      phone VARCHAR(40) NOT NULL DEFAULT '',
      email VARCHAR(191) NOT NULL DEFAULT '',
      birth_date DATE NULL,
      notes TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_patients_owner_name (owner_id, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS packages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      patient_id INT UNSIGNED NOT NULL,
      name VARCHAR(191) NOT NULL,
      total_sessions INT UNSIGNED NOT NULL,
      total_amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
      paid_amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
      payment_method VARCHAR(40) NOT NULL DEFAULT 'Não informado',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
      purchased_at DATE NOT NULL,
      last_payment_at DATE NULL,
      payment_due_date DATE NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Em andamento',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_packages_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
      INDEX idx_packages_owner_patient (owner_id, patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      patient_id INT UNSIGNED NOT NULL,
      package_id INT UNSIGNED NOT NULL,
      performed_at DATE NOT NULL,
      procedure_type VARCHAR(120) NOT NULL DEFAULT '',
      measurement_in VARCHAR(120) NOT NULL DEFAULT '',
      measurement_out VARCHAR(120) NOT NULL DEFAULT '',
      occurrences TEXT NULL,
      notes TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      voided_at TIMESTAMP NULL,
      void_reason VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sessions_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
      CONSTRAINT fk_sessions_package FOREIGN KEY (package_id) REFERENCES packages(id),
      INDEX idx_sessions_owner_package (owner_id, package_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      patient_id INT UNSIGNED NOT NULL,
      package_id INT UNSIGNED NOT NULL,
      amount_cents INT UNSIGNED NOT NULL,
      method VARCHAR(40) NOT NULL,
      paid_at DATE NOT NULL,
      notes TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
      CONSTRAINT fk_payments_package FOREIGN KEY (package_id) REFERENCES packages(id),
      INDEX idx_payments_owner_patient (owner_id, patient_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS appointments (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      patient_id INT UNSIGNED NOT NULL,
      scheduled_at DATETIME NOT NULL,
      duration_minutes INT UNSIGNED NOT NULL DEFAULT 50,
      status VARCHAR(30) NOT NULL DEFAULT 'Agendado',
      notes TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
      INDEX idx_appointments_owner_date (owner_id, scheduled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      description VARCHAR(191) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'Outros',
      amount_cents INT UNSIGNED NOT NULL,
      paid_at DATE NOT NULL,
      notes TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expenses_owner_date (owner_id, paid_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id VARCHAR(191) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id INT UNSIGNED NOT NULL,
      action VARCHAR(40) NOT NULL,
      details TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_owner_entity (owner_id, entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const statement of statements) await pool.execute(statement);
  const sessionColumns = [
    ["procedure_type", "VARCHAR(120) NOT NULL DEFAULT '' AFTER performed_at"],
    ["measurement_in", "VARCHAR(120) NOT NULL DEFAULT '' AFTER procedure_type"],
    ["measurement_out", "VARCHAR(120) NOT NULL DEFAULT '' AFTER measurement_in"],
    ["occurrences", "TEXT NULL AFTER measurement_out"],
    ["updated_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER notes"],
    ["voided_at", "TIMESTAMP NULL AFTER updated_at"],
    ["void_reason", "VARCHAR(255) NULL AFTER voided_at"],
  ] as const;
  for (const [column, definition] of sessionColumns) {
    const [existing] = await pool.execute<RowDataPacket[]>("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = ?", [column]);
    if (!existing.length) await pool.execute(`ALTER TABLE sessions ADD COLUMN ${column} ${definition}`);
  }
  const [dueDateColumn] = await pool.execute<RowDataPacket[]>("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'packages' AND COLUMN_NAME = 'payment_due_date'");
  if (!dueDateColumn.length) await pool.execute("ALTER TABLE packages ADD COLUMN payment_due_date DATE NULL AFTER last_payment_at");
  await pool.execute("UPDATE packages SET payment_due_date = DATE_ADD(purchased_at, INTERVAL 30 DAY) WHERE payment_due_date IS NULL");
  schemaReady = true;
}

export async function rows<T extends RowDataPacket[]>(sql: string, values: (string | number | boolean | Date | null)[] = []) {
  const [result] = await getPool().execute<T>(sql, values);
  return result;
}
