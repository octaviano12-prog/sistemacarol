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
      notes TEXT NOT NULL,
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
  ];
  for (const statement of statements) await pool.execute(statement);
  schemaReady = true;
}

export async function rows<T extends RowDataPacket[]>(sql: string, values: (string | number | boolean | Date | null)[] = []) {
  const [result] = await getPool().execute<T>(sql, values);
  return result;
}
