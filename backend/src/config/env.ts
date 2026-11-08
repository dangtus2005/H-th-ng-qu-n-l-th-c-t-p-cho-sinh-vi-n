import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../../.env') });

const secret = process.env.JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32 || secret === 'secret') {
  throw new Error('JWT_SECRET phải có ít nhất 32 byte và không được dùng khóa mặc định');
}

export const JWT_SECRET: string = secret;
