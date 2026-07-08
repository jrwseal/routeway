# Cold-Storage Vehicle Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "cold-storage vehicle" (รถห้องเย็น) type to Fleet Config, gated by a toggle that defaults to off and, when off, leaves the app behaving exactly as it does today.

**Architecture:** One new DB column (`settings.enable_cold_storage`, default `0`) persists the toggle. The API (`GET`/`PUT /api/fleet`) reads/writes it alongside the existing fleet payload and rejects turning it off while a `cold-storage` vehicle exists. A new pure-logic module (`src/lib/fleetTypes.ts`) centralizes the 4 vehicle-type definitions (label/color/defaults) and the two toggle-driven rules (which types are selectable; whether the toggle can be switched off), replacing the local consts currently hardcoded in `FleetConfigModal.tsx`. The modal wires a new toggle switch to this module.

**Tech Stack:** React 19 + TypeScript, Express, libsql (Turso), Vitest + Supertest.

## Global Constraints

- Toggle default is `0`/`false` — existing deployments and the seeded default fleet are unaffected until a user explicitly enables it. (spec: Data Model)
- Cold-storage vehicle type value: `'cold-storage'`, label "รถห้องเย็น", color `#06B6D4`, defaults `capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500`. (spec: Frontend)
- Server must reject `PUT /fleet` with `enableColdStorage: false` if the submitted `vehicles` array contains any `type === 'cold-storage'` entry — `400` with message `'Cannot disable cold storage while cold-storage vehicles exist'`. (spec: API)
- No changes to `src/lib/algorithms.ts` or any routing/optimization logic — `Vehicle.type` is already free-form. (spec: Optimization / Algorithms, Out of Scope)
- No order/route-level refrigeration matching. (spec: Out of Scope)

---

### Task 1: Vehicle type definitions module

**Files:**
- Create: `src/lib/fleetTypes.ts`
- Test: `src/lib/fleetTypes.test.ts`

**Interfaces:**
- Consumes: `Vehicle` type from `src/types.ts` (`{ id, type, name, capacityCBM, fuelConsumption, fixedCost, color, fuelPrice, departureTime }`, already exists).
- Produces:
  - `interface VehicleTypeDef { type: string; label: string; color: string; defaultCapacityCBM: number; defaultFuelConsumption: number; defaultFixedCost: number; }`
  - `const VEHICLE_TYPE_DEFS: VehicleTypeDef[]` (4 entries, order: `4-wheel`, `6-wheel`, `10-wheel`, `cold-storage`)
  - `function getAvailableVehicleTypes(enableColdStorage: boolean): VehicleTypeDef[]`
  - `function canDisableColdStorage(vehicles: Pick<Vehicle, 'type'>[]): boolean`
  - Used by Task 4 (`FleetConfigModal.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/fleetTypes.test.ts
import { describe, it, expect } from 'vitest';
import { VEHICLE_TYPE_DEFS, getAvailableVehicleTypes, canDisableColdStorage } from './fleetTypes';

describe('VEHICLE_TYPE_DEFS', () => {
  it('includes the cold-storage definition with spec defaults', () => {
    const coldStorage = VEHICLE_TYPE_DEFS.find(d => d.type === 'cold-storage');
    expect(coldStorage).toEqual({
      type: 'cold-storage',
      label: 'รถห้องเย็น',
      color: '#06B6D4',
      defaultCapacityCBM: 10,
      defaultFuelConsumption: 0.18,
      defaultFixedCost: 500,
    });
  });

  it('lists the 3 original types plus cold-storage, in order', () => {
    expect(VEHICLE_TYPE_DEFS.map(d => d.type)).toEqual(['4-wheel', '6-wheel', '10-wheel', 'cold-storage']);
  });
});

describe('getAvailableVehicleTypes', () => {
  it('excludes cold-storage when disabled', () => {
    const types = getAvailableVehicleTypes(false).map(d => d.type);
    expect(types).toEqual(['4-wheel', '6-wheel', '10-wheel']);
  });

  it('includes cold-storage when enabled', () => {
    const types = getAvailableVehicleTypes(true).map(d => d.type);
    expect(types).toEqual(['4-wheel', '6-wheel', '10-wheel', 'cold-storage']);
  });
});

describe('canDisableColdStorage', () => {
  it('returns true when no vehicle is cold-storage', () => {
    expect(canDisableColdStorage([{ type: '4-wheel' }, { type: '6-wheel' }])).toBe(true);
  });

  it('returns false when a cold-storage vehicle is present', () => {
    expect(canDisableColdStorage([{ type: '4-wheel' }, { type: 'cold-storage' }])).toBe(false);
  });

  it('returns true for an empty fleet', () => {
    expect(canDisableColdStorage([])).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/fleetTypes.test.ts`
Expected: FAIL with "Failed to resolve import" / "Cannot find module './fleetTypes'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/fleetTypes.ts
import { Vehicle } from '../types';

export interface VehicleTypeDef {
  type: string;
  label: string;
  color: string;
  defaultCapacityCBM: number;
  defaultFuelConsumption: number;
  defaultFixedCost: number;
}

export const VEHICLE_TYPE_DEFS: VehicleTypeDef[] = [
  { type: '4-wheel', label: 'รถบรรทุก 4 ล้อใหญ่', color: '#10B981', defaultCapacityCBM: 12, defaultFuelConsumption: 0.12, defaultFixedCost: 300 },
  { type: '6-wheel', label: 'รถบรรทุก 6 ล้อ', color: '#3B82F6', defaultCapacityCBM: 32, defaultFuelConsumption: 0.2, defaultFixedCost: 450 },
  { type: '10-wheel', label: 'รถบรรทุก 10 ล้อ', color: '#F97316', defaultCapacityCBM: 48, defaultFuelConsumption: 0.28, defaultFixedCost: 600 },
  { type: 'cold-storage', label: 'รถห้องเย็น', color: '#06B6D4', defaultCapacityCBM: 10, defaultFuelConsumption: 0.18, defaultFixedCost: 500 },
];

export function getAvailableVehicleTypes(enableColdStorage: boolean): VehicleTypeDef[] {
  return VEHICLE_TYPE_DEFS.filter(def => enableColdStorage || def.type !== 'cold-storage');
}

export function canDisableColdStorage(vehicles: Pick<Vehicle, 'type'>[]): boolean {
  return !vehicles.some(v => v.type === 'cold-storage');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/fleetTypes.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fleetTypes.ts src/lib/fleetTypes.test.ts
git commit -m "feat: add vehicle type definitions module with cold-storage type"
```

---

### Task 2: Settings table migration for enable_cold_storage

**Files:**
- Modify: `server/db.ts:31-37` (settings table DDL), `server/db.ts:87-90` area (add new migration block after the `departure_time` migration)
- Test: `server/db.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `settings.enable_cold_storage` column (`INTEGER NOT NULL DEFAULT 0`), readable via `db.execute('SELECT * FROM settings WHERE id = 1')` as `row.enable_cold_storage` (`0` or `1`). Consumed by Task 3 (`server/routes/fleet.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `server/db.test.ts`, inside the existing `describe('createDb', ...)` block:

```typescript
  it('seeds enable_cold_storage as 0 by default', async () => {
    const db = await createDb(':memory:');
    const row = (await db.execute('SELECT * FROM settings WHERE id = 1')).rows[0];
    expect(row.enable_cold_storage).toBe(0);
  });

  it('backfills enable_cold_storage for a settings table that predates the column', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routeway-db-migration-test-'));
    const dbPath = join(dir, 'test.db');
    try {
      const oldDb = createClient({ url: `file:${dbPath}` });
      await oldDb.executeMultiple(`
        CREATE TABLE vehicles (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          capacity_cbm REAL NOT NULL,
          fuel_consumption REAL NOT NULL,
          fixed_cost REAL NOT NULL,
          color TEXT NOT NULL,
          fuel_price REAL NOT NULL DEFAULT 35,
          departure_time TEXT NOT NULL DEFAULT '08:00'
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          driver_wage REAL NOT NULL DEFAULT 60,
          fuel_price_4w REAL NOT NULL DEFAULT 35,
          fuel_price_6w REAL NOT NULL DEFAULT 35,
          fuel_price_10w REAL NOT NULL DEFAULT 35
        );
        INSERT INTO settings (id, driver_wage) VALUES (1, 60);
        INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color) VALUES
          ('4w-1', '4-wheel', 'Old 4W', 12, 0.12, 300, '#10B981');
      `);
      oldDb.close();

      const migratedDb = await createDb(`file:${dbPath}`);
      const row = (await migratedDb.execute('SELECT * FROM settings WHERE id = 1')).rows[0];
      expect(row.enable_cold_storage).toBe(0);
      migratedDb.close();
    } finally {
      cleanupDir(dir);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/db.test.ts`
Expected: FAIL — `enable_cold_storage` is `undefined`, not `0` (column doesn't exist yet).

- [ ] **Step 3: Write the implementation**

In `server/db.ts`, add `enable_cold_storage` to the `CREATE TABLE IF NOT EXISTS settings` DDL (for fresh databases):

```typescript
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      driver_wage REAL NOT NULL DEFAULT 60,
      fuel_price_4w REAL NOT NULL DEFAULT 35,
      fuel_price_6w REAL NOT NULL DEFAULT 35,
      fuel_price_10w REAL NOT NULL DEFAULT 35,
      enable_cold_storage INTEGER NOT NULL DEFAULT 0
    );
```

Then, after the existing `hasDepartureTimeColumn` migration block (right before `const vehicleCount = ...`), add a migration for existing databases:

```typescript
  const settingsColumns = (await db.execute('PRAGMA table_info(settings)')).rows as unknown as { name: string }[];
  const hasEnableColdStorageColumn = settingsColumns.some((c) => c.name === 'enable_cold_storage');
  if (!hasEnableColdStorageColumn) {
    await db.execute('ALTER TABLE settings ADD COLUMN enable_cold_storage INTEGER NOT NULL DEFAULT 0');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/db.test.ts`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/db.test.ts
git commit -m "feat: add enable_cold_storage settings column with migration"
```

---

### Task 3: Fleet API — read/write and validation guard for the toggle

**Files:**
- Modify: `server/routes/fleet.ts`
- Modify: `src/lib/api.ts:5-8` (`FleetConfig` interface)
- Test: `server/routes/fleet.test.ts`

**Interfaces:**
- Consumes: `settings.enable_cold_storage` column from Task 2.
- Produces: `GET /api/fleet` response shape `{ vehicles: Vehicle[], driverWage: number, enableColdStorage: boolean }`. `PUT /api/fleet` accepts the same shape in its body. Consumed by Task 4 (`FleetConfigModal.tsx`) via `src/lib/api.ts`'s `getFleet`/`saveFleet`.

- [ ] **Step 1: Write the failing tests**

Add to `server/routes/fleet.test.ts`:

```typescript
  it('returns enableColdStorage: false by default', async () => {
    const res = await request(app).get('/api/fleet');
    expect(res.body.enableColdStorage).toBe(false);
  });

  it('saves enableColdStorage: true with a cold-storage vehicle', async () => {
    const putRes = await request(app).put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
    expect(getRes.body.vehicles[0].type).toBe('cold-storage');
  });

  it('rejects disabling cold storage while a cold-storage vehicle is present', async () => {
    await request(app).put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: true,
    });

    const putRes = await request(app).put('/api/fleet').send({
      vehicles: [
        { id: 'cold-1', type: 'cold-storage', name: 'Cold Truck 1', capacityCBM: 10, fuelConsumption: 0.18, fixedCost: 500, color: '#06B6D4', fuelPrice: 35, departureTime: '08:00' },
      ],
      driverWage: 60,
      enableColdStorage: false,
    });
    expect(putRes.status).toBe(400);
    expect(putRes.body.error).toBe('Cannot disable cold storage while cold-storage vehicles exist');

    const getRes = await request(app).get('/api/fleet');
    expect(getRes.body.enableColdStorage).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/routes/fleet.test.ts`
Expected: FAIL — `enableColdStorage` is `undefined` on GET; PUT with `enableColdStorage: false` + cold-storage vehicle returns `200` instead of `400`.

- [ ] **Step 3: Write the implementation**

In `server/routes/fleet.ts`:

```typescript
interface SettingsRow {
  driver_wage: number;
  enable_cold_storage: number;
}
```

In the `GET /` handler, add `enableColdStorage` to the response:

```typescript
    res.json({
      vehicles: rows.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        capacityCBM: r.capacity_cbm,
        fuelConsumption: r.fuel_consumption,
        fixedCost: r.fixed_cost,
        color: r.color,
        fuelPrice: r.fuel_price,
        departureTime: r.departure_time,
      })),
      driverWage: settings.driver_wage,
      enableColdStorage: Boolean(settings.enable_cold_storage),
    });
```

In the `PUT /` handler, add the guard before the `db.batch` call and persist the new field:

```typescript
  router.put('/', async (req, res) => {
    const { vehicles, driverWage, enableColdStorage } = req.body ?? {};
    if (!Array.isArray(vehicles)) {
      res.status(400).json({ error: 'vehicles must be an array' });
      return;
    }
    for (const v of vehicles) {
      if (!v.id || !v.type || !v.name || typeof v.capacityCBM !== 'number' || typeof v.fuelConsumption !== 'number' || typeof v.fixedCost !== 'number' || !v.color || typeof v.fuelPrice !== 'number' || typeof v.departureTime !== 'string') {
        res.status(400).json({ error: 'Invalid vehicle entry' });
        return;
      }
    }
    if (!enableColdStorage && vehicles.some((v: any) => v.type === 'cold-storage')) {
      res.status(400).json({ error: 'Cannot disable cold storage while cold-storage vehicles exist' });
      return;
    }

    await db.batch([
      { sql: 'DELETE FROM vehicles', args: [] },
      ...vehicles.map((v: any) => ({
        sql: 'INSERT INTO vehicles (id, type, name, capacity_cbm, fuel_consumption, fixed_cost, color, fuel_price, departure_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [v.id, v.type, v.name, v.capacityCBM, v.fuelConsumption, v.fixedCost, v.color, v.fuelPrice, v.departureTime],
      })),
      { sql: 'UPDATE settings SET driver_wage = ?, enable_cold_storage = ? WHERE id = 1', args: [driverWage ?? 60, enableColdStorage ? 1 : 0] },
    ], 'write');

    res.json({ ok: true });
  });
```

In `src/lib/api.ts`, update the `FleetConfig` interface:

```typescript
export interface FleetConfig {
  vehicles: Vehicle[];
  driverWage: number;
  enableColdStorage: boolean;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/routes/fleet.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with no errors; all vitest suites pass (note: `FleetConfigModal.tsx` isn't touched yet in this task, so nothing there should break).

- [ ] **Step 6: Commit**

```bash
git add server/routes/fleet.ts server/routes/fleet.test.ts src/lib/api.ts
git commit -m "feat: read/write enableColdStorage in fleet API with disable guard"
```

---

### Task 4: Fleet Config UI — cold-storage type and toggle switch

**Files:**
- Modify: `src/components/FleetConfigModal.tsx`

**Interfaces:**
- Consumes: `VEHICLE_TYPE_DEFS`, `getAvailableVehicleTypes`, `canDisableColdStorage` from `src/lib/fleetTypes.ts` (Task 1); `FleetConfig` (now including `enableColdStorage: boolean`), `getFleet`, `saveFleet` from `src/lib/api.ts` (Task 3).
- Produces: no new exports — this is the top-level modal component, already wired into `Dashboard.tsx` (`isOpen`/`onClose`/`onSaved` props unchanged).

- [ ] **Step 1: Replace the local type consts with the shared module**

In `src/components/FleetConfigModal.tsx`, remove the local `TYPE_LABELS`, `TYPE_COLORS`, `VEHICLE_TYPES` consts (lines 12-22) and the `Vehicle`/icon imports stay as-is. Add:

```typescript
import { VEHICLE_TYPE_DEFS, getAvailableVehicleTypes, canDisableColdStorage } from '../lib/fleetTypes';
```

- [ ] **Step 2: Add `enableColdStorage` state and load/save it**

Replace the `driverWage` state block and its `useEffect`/`handleSave` with:

```typescript
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverWage, setDriverWage] = useState(60);
  const [enableColdStorage, setEnableColdStorage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    getFleet().then(fleet => {
      setVehicles(fleet.vehicles);
      setDriverWage(fleet.driverWage);
      setEnableColdStorage(fleet.enableColdStorage);
      setIsLoading(false);
    });
  }, [isOpen]);
```

```typescript
  const handleSave = async () => {
    await saveFleet({ vehicles, driverWage, enableColdStorage });
    onSaved();
    onClose();
  };
```

- [ ] **Step 3: Rewrite `addVehicle`/`updateVehicleType` to use `VEHICLE_TYPE_DEFS`**

```typescript
  const addVehicle = (type: string) => {
    const def = VEHICLE_TYPE_DEFS.find(d => d.type === type)!;
    const count = vehicles.filter(v => v.type === type).length;
    setVehicles(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      name: `${def.label} - คันที่ ${count + 1}`,
      capacityCBM: def.defaultCapacityCBM,
      fuelConsumption: def.defaultFuelConsumption,
      fixedCost: def.defaultFixedCost,
      color: def.color,
      fuelPrice: 35,
      departureTime: '08:00',
    }]);
  };

  const updateVehicleType = (id: string, type: string) => {
    const def = VEHICLE_TYPE_DEFS.find(d => d.type === type)!;
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, type, color: def.color } : v));
  };
```

- [ ] **Step 4: Update sorting to use the full type list**

```typescript
  const sortedVehicles = [...vehicles].sort((a, b) => {
    const typeOrder = VEHICLE_TYPE_DEFS.findIndex(d => d.type === a.type) - VEHICLE_TYPE_DEFS.findIndex(d => d.type === b.type);
    return typeOrder !== 0 ? typeOrder : a.name.localeCompare(b.name);
  });

  const availableTypeDefs = getAvailableVehicleTypes(enableColdStorage);
  const toggleLocked = enableColdStorage && !canDisableColdStorage(vehicles);
```

- [ ] **Step 5: Render the toggle and switch the add-buttons/dropdown to `availableTypeDefs`**

Add the toggle right after the driver-wage block (after the closing `</div>` of the driver-wage `div`, before the vehicle list `div`):

```tsx
              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer" title={toggleLocked ? 'ลบรถห้องเย็นออกจากกองรถก่อนจึงจะปิดได้' : undefined}>
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enableColdStorage}
                    disabled={toggleLocked}
                    onChange={(e) => setEnableColdStorage(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-fleet-navy peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
                </label>
                <span className="font-bold text-slate-700 text-lg">🧊 เปิดใช้งานรถห้องเย็น</span>
              </div>
```

Change the add-vehicle buttons block to iterate `availableTypeDefs`:

```tsx
                  <div className="flex gap-2">
                    {availableTypeDefs.map(def => (
                      <button
                        key={def.type}
                        onClick={() => addVehicle(def.type)}
                        className="flex items-center text-xs font-bold text-fleet-navy hover:underline"
                      >
                        <Plus className="w-3 h-3 mr-1" /> {def.label}
                      </button>
                    ))}
                  </div>
```

Change the per-row type `<select>` to iterate `availableTypeDefs`, and look up labels via `VEHICLE_TYPE_DEFS` (so a row already showing `cold-storage` still renders its label even in an edge case where the dropdown options themselves are filtered):

```tsx
                            <select
                              value={v.type}
                              onChange={(e) => updateVehicleType(v.id, e.target.value)}
                              className="border border-slate-300 rounded px-2 py-1 bg-white"
                            >
                              {availableTypeDefs.map(def => (
                                <option key={def.type} value={def.type}>{def.label}</option>
                              ))}
                            </select>
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `npm run lint && npx vitest run`
Expected: `tsc --noEmit` passes with no errors (no leftover references to the removed `TYPE_LABELS`/`TYPE_COLORS`/`VEHICLE_TYPES` consts); all vitest suites pass.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev` (starts client + server), open the app, log in, open Fleet Config.
Verify:
- Toggle is off by default; no "รถห้องเย็น" button or dropdown option appears.
- Turning the toggle on reveals the "รถห้องเย็น" add-button; clicking it adds a row with capacity 10 / fuel 0.18 / fixed cost 500 / cyan color swatch in the type `<select>`.
- With a cold-storage row present, the toggle becomes visually disabled (cannot be unchecked) and shows the tooltip on hover.
- Removing the cold-storage row re-enables the toggle; turning it off then hides the type from buttons/dropdown again.
- Save persists the state — reopening Fleet Config (or reloading the page) shows the same toggle position and vehicle list.

Stop the dev server after verifying.

- [ ] **Step 8: Commit**

```bash
git add src/components/FleetConfigModal.tsx
git commit -m "feat: add cold-storage vehicle toggle to Fleet Config UI"
```

---

## Self-Review Notes

- **Spec coverage:** Data Model → Task 2. API (GET/PUT + guard) → Task 3. Frontend (type defaults, toggle show/hide, disabled-toggle guard, single-PUT save) → Task 1 + Task 4. Optimization/Algorithms → confirmed no task touches `algorithms.ts` (Out of Scope honored). Testing → `fleet.test.ts` extended in Task 3; `db.test.ts` extended in Task 2; pure-logic unit tests in Task 1 cover the toggle/dropdown-filtering rules that the spec asked to be covered at the component level (no component-level test harness — e.g. `@testing-library/react` — exists in this repo today; adding one is out of scope for this feature, so the toggle-driven *logic* is tested directly instead of through simulated clicks, and Task 4 Step 7 covers the actual UI interaction manually).
- **Type consistency:** `VehicleTypeDef`, `getAvailableVehicleTypes`, `canDisableColdStorage` signatures are identical across Task 1 (definition) and Task 4 (usage). `FleetConfig.enableColdStorage: boolean` matches the API's `res.json({ ..., enableColdStorage: Boolean(...) })` in Task 3 and the client `getFleet()`/`saveFleet()` call sites in Task 4.
- **No placeholders:** every step has complete, copy-pasteable code.
