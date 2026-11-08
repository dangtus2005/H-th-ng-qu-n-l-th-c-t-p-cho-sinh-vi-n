export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

export function text(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    fail(`${label}: bắt buộc, tối đa ${max} ký tự`);
  }
  return (value as string).trim();
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    fail(`${label} không hợp lệ`);
  }
  return value as string;
}

export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    fail('Mật khẩu phải có ít nhất 8 ký tự và không quá 72 byte');
  }
  return value as string;
}

export function email(value: unknown): string {
  const result = text(value, 'Email', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    fail('Email không hợp lệ');
  }
  return result;
}
