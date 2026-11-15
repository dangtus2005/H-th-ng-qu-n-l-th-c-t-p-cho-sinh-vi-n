import type { Request, Response } from 'express';
import { pool } from '../config/db';
import { fail, uuid } from '../utils/validation';

export const list = async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id,title,content,type,is_read,created_at FROM notifications
     WHERE recipient_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
    [req.user!.sub],
  );
  res.json(rows);
};

export const read = async (req: Request, res: Response) => {
  if (
    !(
      await pool.query(
        'UPDATE notifications SET is_read=true,read_at=coalesce(read_at,now()) WHERE id=$1 AND recipient_id=$2',
        [uuid(req.params.notificationId, 'Thông báo'), req.user!.sub],
      )
    ).rowCount
  )
    fail('Không tìm thấy thông báo', 404);
  res.json({ message: 'Đã đọc' });
};
