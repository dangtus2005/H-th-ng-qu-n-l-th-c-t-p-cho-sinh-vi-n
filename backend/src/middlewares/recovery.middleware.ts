import type { Request, Response, NextFunction } from 'express';
const requests = new Map<string, { count: number; until: number }>();
// shortcut: giới hạn trong một tiến trình; chuyển sang Redis/proxy khi chạy nhiều instance.

export function recoveryLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, value] of requests)
    if (value.until <= now) {
      requests.delete(key);
    }
  const key = req.ip || 'unknown';
  const entry = requests.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 20 || (!requests.has(key) && requests.size >= 10000)) {
    res.setHeader('Retry-After', '900');
    res.status(429).json({ message: 'Quá nhiều yêu cầu khôi phục. Vui lòng thử lại sau 15 phút.' });
    return;
  }
  entry.count++;
  requests.set(key, entry);
  next();
}
