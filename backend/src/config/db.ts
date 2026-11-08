import { Pool } from 'pg';
import './env';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 5000,
  options:
    '-c search_path=public,user_auth,operation,thesis,progress,internship,evaluation,support',
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error(' Lỗi kết nối PostgreSQL bất ngờ:', err);
});
