import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { resolveStageAccess } from '@/lib/server/stage-access';
import { hostedState } from '@/lib/persistence/hosted-state';

type Context = { params: Promise<{ id: string }> };

async function position(req: Request, ctx: Context) {
  if (process.env.OPENMAIC_HOSTED !== 'true') return new Response(null, { status: 404 });
  return withRequestOwner(req, async (principal, headers) => {
    headers.set('cache-control', 'no-store');
    const { id } = await ctx.params;
    const stage = await resolveStageAccess(id);
    if (stage?.ownerId !== principal.ownerId) return new Response(null, { status: 404, headers });
    const db = await hostedState();
    if (req.method === 'GET') {
      const { rows } = await db.query(
        'SELECT scene_id AS "sceneId", updated_at AS "updatedAt" FROM hosted_position WHERE stage_id=$1',
        [id],
      );
      return Response.json(rows[0] ?? null, { headers });
    }
    const data = await req.json().catch(() => null);
    if (
      !data ||
      (data.sceneId !== null && (typeof data.sceneId !== 'string' || data.sceneId.length > 200)) ||
      typeof data.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.updatedAt))
    )
      return new Response(null, { status: 400, headers });
    await db.query(
      `INSERT INTO hosted_position(stage_id,scene_id,updated_at) VALUES ($1,$2,LEAST($3::timestamptz,clock_timestamp()))
    ON CONFLICT(stage_id) DO UPDATE SET scene_id=excluded.scene_id, updated_at=excluded.updated_at
    WHERE hosted_position.updated_at <= excluded.updated_at`,
      [id, data.sceneId, data.updatedAt],
    );
    return new Response(null, { status: 204, headers });
  });
}
export const GET = position;
export const PUT = position;
