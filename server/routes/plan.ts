import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { requireAuth, requireRole } from '../middleware';

interface ActivePlanRow {
  optimization_criterion: string;
  nodes_json: string;
  legs_json: string;
  route_summaries_json: string;
  aggregates_json: string;
}

function loadPlan(db: DatabaseSync) {
  const row = db.prepare('SELECT * FROM active_plan WHERE id = 1').get() as unknown as ActivePlanRow | undefined;
  if (!row) return null;
  return {
    optimizationCriterion: row.optimization_criterion,
    nodes: JSON.parse(row.nodes_json),
    legs: JSON.parse(row.legs_json),
    routeSummaries: JSON.parse(row.route_summaries_json),
    ...JSON.parse(row.aggregates_json),
  };
}

export function planRouter(db: DatabaseSync): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/', requireRole('planner'), (req, res) => {
    const { optimizationCriterion, data } = req.body ?? {};
    if (!data || !Array.isArray(data.routeSummaries)) {
      res.status(400).json({ error: 'Invalid plan payload' });
      return;
    }
    const { nodes, legs, routeSummaries, ...aggregates } = data;

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO active_plan (id, created_at, optimization_criterion, nodes_json, legs_json, route_summaries_json, aggregates_json)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          created_at = excluded.created_at,
          optimization_criterion = excluded.optimization_criterion,
          nodes_json = excluded.nodes_json,
          legs_json = excluded.legs_json,
          route_summaries_json = excluded.route_summaries_json,
          aggregates_json = excluded.aggregates_json
      `).run(new Date().toISOString(), optimizationCriterion, JSON.stringify(nodes), JSON.stringify(legs), JSON.stringify(routeSummaries), JSON.stringify(aggregates));

      db.prepare('DELETE FROM plan_progress').run();
      const insertProgress = db.prepare(
        'INSERT INTO plan_progress (route_index, current_step, step_state) VALUES (?, 0, ?)'
      );
      for (const summary of routeSummaries) {
        insertProgress.run(summary.routeIndex, 'pending');
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({ ok: true });
  });

  router.get('/active', (req, res) => {
    const plan = loadPlan(db);
    if (!plan) {
      res.json({ plan: null });
      return;
    }
    if (req.user!.role === 'planner') {
      res.json({ plan });
      return;
    }

    const myRouteIndexes = plan.routeSummaries
      .filter((s: any) => s.vehicle.driverUserId === req.user!.sub)
      .map((s: any) => s.routeIndex);

    if (myRouteIndexes.length === 0) {
      res.json({ plan: null });
      return;
    }

    const myLegs = plan.legs.filter((l: any) => myRouteIndexes.includes(l.routeIndex));
    const myNodeIds = new Set<number>();
    for (const leg of myLegs) {
      myNodeIds.add(leg.fromNode.id);
      myNodeIds.add(leg.toNode.id);
    }

    const progressRow = db.prepare(
      'SELECT route_index, current_step, step_state FROM plan_progress WHERE route_index = ?'
    ).get(myRouteIndexes[0]) as { route_index: number; current_step: number; step_state: string } | undefined;

    res.json({
      plan: {
        optimizationCriterion: plan.optimizationCriterion,
        nodes: plan.nodes.filter((n: any) => myNodeIds.has(n.id)),
        legs: myLegs,
        routeSummaries: plan.routeSummaries.filter((s: any) => myRouteIndexes.includes(s.routeIndex)),
      },
      progress: progressRow
        ? { routeIndex: progressRow.route_index, currentStep: progressRow.current_step, stepState: progressRow.step_state }
        : null,
    });
  });

  router.post('/progress', requireRole('driver'), (req, res) => {
    const { routeIndex, currentStep, stepState } = req.body ?? {};
    const plan = loadPlan(db);
    const owns = plan?.routeSummaries.some((s: any) => s.routeIndex === routeIndex && s.vehicle.driverUserId === req.user!.sub);
    if (!owns) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    db.prepare(`
      INSERT INTO plan_progress (route_index, current_step, step_state, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(route_index) DO UPDATE SET
        current_step = excluded.current_step,
        step_state = excluded.step_state,
        updated_at = excluded.updated_at
    `).run(routeIndex, currentStep, stepState);
    res.json({ ok: true });
  });

  router.get('/progress', requireRole('planner'), (req, res) => {
    const rows = db.prepare('SELECT route_index, current_step, step_state FROM plan_progress ORDER BY route_index').all() as any[];
    res.json(rows.map(r => ({ routeIndex: r.route_index, currentStep: r.current_step, stepState: r.step_state })));
  });

  return router;
}
