import type { PoolClient } from 'pg';
import { fail } from './validation';

export async function resultState(db: Pick<PoolClient, 'query'>, id: string) {
  return (
    (await db.query('SELECT * FROM campaign_results WHERE campaign_id=$1', [id])).rows[0] ?? null
  );
}

export async function requireUnpublished(db: Pick<PoolClient, 'query'>, id: string) {
  if ((await resultState(db, id))?.published_at)
    fail('Đợt đã công bố điểm. Hãy xử lý thay đổi qua phúc khảo.', 409);
}
