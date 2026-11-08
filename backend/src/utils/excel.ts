import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { checkArchive } from '../controllers/import.controller';
import { fail } from './validation';

export async function template(res: Response, headers: string[], name: string) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Data');
  sheet.addRow(headers);
  sheet.columns.forEach((c) => {
    c.width = 25;
    c.numFmt = '@';
  });
  sheet.getRow(1).font = { bold: true };
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.attachment(name + '.xlsx');
  res.send(Buffer.from(await book.xlsx.writeBuffer()));
}

export async function readExcel(req: Request, headers: string[]) {
  const file = req.file;
  if (
    !file ||
    !file.originalname.toLowerCase().endsWith('.xlsx') ||
    file.size > 5 * 1024 * 1024 ||
    file.buffer.subarray(0, 4).toString('hex') !== '504b0304'
  ) {
    fail('Chọn file XLSX, tối đa 5 MB');
  }
  checkArchive(file!.buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file!.buffer as unknown as ExcelJS.Buffer);
  } catch {
    fail('Không đọc được Excel');
  }
  if (book.worksheets.length !== 1) {
    fail('File cần đúng một sheet');
  }
  const sheet = book.worksheets[0]!;
  if (sheet.rowCount < 2 || sheet.rowCount > 201 || sheet.columnCount > headers.length) {
    fail('File cần 1–200 dòng, đúng cột mẫu');
  }
  headers.forEach((h, i) => {
    if (
      sheet
        .getRow(1)
        .getCell(i + 1)
        .text.trim() !== h
    ) {
      fail(`Cột ${i + 1} cần là ${h}`);
    }
  });
  const rows: { row: number; values: Record<string, string>; error?: string }[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (!row.hasValues) {
      continue;
    }
    const values: Record<string, string> = {};
    let error: string | undefined;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      if ([ExcelJS.ValueType.Formula, ExcelJS.ValueType.Error].includes(cell.type)) {
        error = `Không dùng công thức/lỗi ở ${h}`;
      }
      values[h] = cell.text.trim();
    });
    rows.push({ row: n, values, ...(error ? { error } : {}) });
  }
  if (!rows.length) {
    fail('File không có dữ liệu');
  }
  return rows;
}
