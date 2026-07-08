import { Router } from 'express';
import type { Client } from '@libsql/client';

interface ActivePlanRow {
  optimization_criterion: string;
  nodes_json: string;
  legs_json: string;
  route_summaries_json: string;
  aggregates_json: string;
}

async function loadPlan(db: Client) {
  const result = await db.execute('SELECT * FROM active_plan WHERE id = 1');
  const row = result.rows[0] as unknown as ActivePlanRow | undefined;
  if (!row) return null;
  return {
    optimizationCriterion: row.optimization_criterion,
    nodes: JSON.parse(row.nodes_json),
    legs: JSON.parse(row.legs_json),
    routeSummaries: JSON.parse(row.route_summaries_json),
    ...JSON.parse(row.aggregates_json),
  };
}

export function planRouter(db: Client): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { optimizationCriterion, data } = req.body ?? {};
    if (!data || !Array.isArray(data.routeSummaries)) {
      res.status(400).json({ error: 'Invalid plan payload' });
      return;
    }
    const { nodes, legs, routeSummaries, ...aggregates } = data;

    await db.batch([
      {
        sql: `
          INSERT INTO active_plan (id, created_at, optimization_criterion, nodes_json, legs_json, route_summaries_json, aggregates_json)
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            created_at = excluded.created_at,
            optimization_criterion = excluded.optimization_criterion,
            nodes_json = excluded.nodes_json,
            legs_json = excluded.legs_json,
            route_summaries_json = excluded.route_summaries_json,
            aggregates_json = excluded.aggregates_json
        `,
        args: [new Date().toISOString(), optimizationCriterion, JSON.stringify(nodes), JSON.stringify(legs), JSON.stringify(routeSummaries), JSON.stringify(aggregates)],
      },
      { sql: 'DELETE FROM plan_progress', args: [] },
      ...routeSummaries.map((summary: any) => ({
        sql: 'INSERT INTO plan_progress (route_index, current_step, step_state) VALUES (?, 0, ?)',
        args: [summary.routeIndex, 'pending'],
      })),
    ], 'write');

    res.json({ ok: true });
  });

  router.get('/active', async (req, res) => {
    const plan = await loadPlan(db);
    res.json({ plan });
  });

  router.post('/progress', async (req, res) => {
    const { routeIndex, currentStep, stepState } = req.body ?? {};
    await db.execute({
      sql: `
        INSERT INTO plan_progress (route_index, current_step, step_state, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(route_index) DO UPDATE SET
          current_step = excluded.current_step,
          step_state = excluded.step_state,
          updated_at = excluded.updated_at
      `,
      args: [routeIndex, currentStep, stepState],
    });
    res.json({ ok: true });
  });

  router.get('/progress', async (req, res) => {
    const result = await db.execute('SELECT route_index, current_step, step_state FROM plan_progress ORDER BY route_index');
    res.json(result.rows.map((r: any) => ({ routeIndex: r.route_index, currentStep: r.current_step, stepState: r.step_state })));
  });

  return router;
}
