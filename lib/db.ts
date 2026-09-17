import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL || 'mysql://smart_user:smart_password@localhost:3306/smart_home_store';
const globalForDb = globalThis as typeof globalThis & { smartHomePool?: mysql.Pool };

export const db = globalForDb.smartHomePool ?? mysql.createPool({
  uri: databaseUrl,
  charset: 'utf8mb4',
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
});

if (process.env.NODE_ENV !== 'production') globalForDb.smartHomePool = db;
