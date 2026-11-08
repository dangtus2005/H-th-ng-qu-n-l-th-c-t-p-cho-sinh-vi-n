import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { pool } from '../config/db';
import { createAccount } from './accounts.controller';
import { fail } from '../utils/validation';
const headers = [
  'code',
  'email',
  'full_name',
  'password',
  'role_code',
  'faculty_code',
  'department_code',
  'major_code',
  'campaign_code',
];

export function checkArchive(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) {
    fail('Cấu trúc file Excel không hợp lệ');
  }
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let expanded = 0;
  if (entries > 200) {
    fail('File Excel có quá nhiều thành phần');
  }
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail('Cấu trúc file Excel không hợp lệ');
    }
    expanded += buffer.readUInt32LE(offset + 24);
    if (expanded > 20 * 1024 * 1024) {
      fail('File Excel giải nén vượt quá 20 MB');
    }
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}

export const importTemplate = async (_req: Request, res: Response): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Users');
  sheet.addRow(headers);
  sheet.columns.forEach((column) => {
    column.width = 25;
    column.numFmt = '@';
  });
  sheet.getRow(1).font = { bold: true };
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="users-template.xlsx"');
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
};

export const importUsers = async (req: Request, res: Response): Promise<void> => {
  if (
    !req.file ||
    !req.file.originalname.toLowerCase().endsWith('.xlsx') ||
    req.file.buffer.subarray(0, 4).toString('hex') !== '504b0304'
  ) {
    fail('Vui lòng chọn file Excel .xlsx, tối đa 5 MB');
  }
  checkArchive(req.file!.buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file!.buffer as unknown as ExcelJS.Buffer);
  } catch {
    fail('Không đọc được file Excel .xlsx');
  }
  if (workbook.worksheets.length !== 1) {
    fail('File Excel cần đúng một sheet Users');
  }
  const sheet = workbook.worksheets[0]!;
  if (sheet.actualRowCount < 2 || sheet.rowCount > 201 || sheet.columnCount > headers.length) {
    fail('File cần từ 1 đến 200 dòng tài khoản và đúng các cột của mẫu');
  }
  headers.forEach((header, i) => {
    if (
      sheet
        .getRow(1)
        .getCell(i + 1)
        .text.trim() !== header
    ) {
      fail(`Cột ${i + 1} phải là ${header}; hãy tải file mẫu`);
    }
  });
  const client = await pool.connect();
  let rowNumber = 2;
  let count = 0;
  try {
    await client.query('BEGIN');
    for (; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (!row.hasValues) {
        continue;
      }
      const values: Record<string, string> = {};
      headers.forEach((header, i) => {
        const cell = row.getCell(i + 1);
        if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) {
          fail(`Không dùng công thức ở cột ${header}`);
        }
        values[header] = header === 'password' ? cell.text : cell.text.trim();
      });
      const scope: Record<string, string | null> = {};
      for (const [field, table] of [
        ['faculty', 'faculties'],
        ['department', 'departments'],
        ['major', 'majors'],
        ['campaign', 'campaigns'],
      ]) {
        const code = values[`${field}_code`];
        scope[`${field}_id`] = null;
        if (code) {
          const match = (await client.query(`SELECT id FROM ${table} WHERE code=$1`, [code]))
            .rows[0];
          if (!match) {
            fail(`Không tìm thấy mã ${field}: ${code}`);
          }
          scope[`${field}_id`] = match.id;
        }
      }
      const roles = (values.role_code || '')
        .split('|')
        .map((role) => ({ role_code: role.trim(), ...scope }));
      await createAccount(client, { ...values, roles }, req);
      count++;
    }
    if (!count) {
      fail('File không có tài khoản');
    }
    await client.query('COMMIT');
    res.status(201).json({ created: count, message: `Đã nhập ${count} tài khoản` });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const e = error as { status?: number; code?: string; message?: string };
    if (e.status === 400 || e.code === '23505' || e.code === '23503' || e.code === '22P02') {
      fail(
        `Dòng ${rowNumber}: ${e.code === '23505' ? 'Email, mã tài khoản hoặc vai trò bị trùng' : e.status === 400 ? e.message : 'Mã hoặc phạm vi không hợp lệ'}. Toàn bộ file chưa được lưu.`,
      );
    }
    throw error;
  } finally {
    client.release();
  }
};
