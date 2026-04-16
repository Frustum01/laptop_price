import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

export default async function connectDB() {
  try {
    const dbPassword = String(process.env.DB_PASSWORD || "").trim();

    console.log("DB PASSWORD TYPE:", typeof dbPassword);
    console.log("DB PASSWORD VALUE:", dbPassword);

    const pool = new Pool({
      host: String(process.env.DB_HOST || "localhost"),
      port: Number(process.env.DB_PORT || 5432),
      user: String(process.env.DB_USER || "postgres"),
      password: dbPassword,
      database: String(process.env.DB_NAME || "datainsights"),
    });

    await pool.connect();

    console.log("✅ PostgreSQL Connected Successfully");

    return pool;
  } catch (err) {
    console.error("❌ PostgreSQL Connection Error:", err.message);
    process.exit(1);
  }
}