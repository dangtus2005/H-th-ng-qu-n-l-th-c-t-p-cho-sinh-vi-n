const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const destination = path.join(__dirname, '../database/init.sql');
const temporary = `${destination}.${process.pid}.tmp`;
const executable =
  process.env.PG_DUMP_PATH ||
  (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump');
const config = new Client({ connectionString: process.env.DATABASE_URL }).connectionParameters;
let descriptor;
try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  descriptor = fs.openSync(temporary, 'wx');
  // Ghi stdout bằng Node để đường dẫn Windows có dấu không phụ thuộc pg_dump.
  const result = spawnSync(
    executable,
    [
      '--format=plain',
      '--encoding=UTF8',
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--exclude-table-data=public.auth_sessions',
      '--exclude-table-data=public.password_resets',
    ],
    {
      env: {
        ...process.env,
        PGHOST: config.host,
        PGPORT: String(config.port),
        PGUSER: config.user,
        PGPASSWORD: config.password || '',
        PGDATABASE: config.database,
        PGCONNECT_TIMEOUT: '10',
      },
      stdio: ['ignore', descriptor, 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  fs.closeSync(descriptor);
  descriptor = undefined;
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `pg_dump failed: ${result.status}`);
  }
  const sql = fs.readFileSync(temporary, 'utf8');
  if (
    !sql.includes('-- PostgreSQL database dump complete') ||
    !sql.includes('CREATE TABLE public.users')
  ) {
    throw new Error(
      'Dump incomplete or DATABASE_URL does not point to the expected application database',
    );
  }
  if (fs.existsSync(destination)) {
    const previous = destination.replace(/\.sql$/, `.before-backup-${Date.now()}.sql`);
    fs.copyFileSync(destination, previous, fs.constants.COPYFILE_EXCL);
    console.log(`Previous SQL preserved: ${path.basename(previous)}`);
  }
  fs.copyFileSync(temporary, destination);
  if (fs.statSync(destination).size !== fs.statSync(temporary).size) {
    throw new Error('Exported file size mismatch');
  }
  console.log(`Backup complete: ${destination}`);
  console.log(
    `Tables: ${(sql.match(/^CREATE TABLE /gm) || []).length}; data sections: ${(sql.match(/^COPY /gm) || []).length}`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (descriptor !== undefined) {
    fs.closeSync(descriptor);
  }
  if (fs.existsSync(temporary)) {
    fs.unlinkSync(temporary);
  }
}
