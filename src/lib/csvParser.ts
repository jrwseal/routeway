import Papa from 'papaparse';
import { parse } from 'date-fns';
import type { RouteNode, Parcel } from '../types';

function parseTimeOnDate(timeStr: string | undefined, todayStr: string): Date | null {
  if (!timeStr || !timeStr.trim()) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return parse(`${todayStr} ${h}:${m}`, 'yyyy-MM-dd HH:mm', new Date());
  }
  return null;
}

const VALID_TIERS: Parcel['tier'][] = ['critical', 'standard', 'low'];

/**
 * One row = one parcel. Rows sharing the same Location/Lat/Lon collapse into a
 * single RouteNode with multiple parcels — a stop can carry several payloads
 * with different cold-chain requirements. Rows without a Parcel_Id behave
 * exactly like the legacy one-row-per-node format (parcels stays undefined).
 */
export function parseManifestRows(rows: Record<string, string>[]): RouteNode[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const nodesByKey = new Map<string, RouteNode>();
  const order: string[] = [];

  rows.forEach((row, index) => {
    const location = row['Location'] || `Node ${index}`;
    const lat = parseFloat(row['Lat']);
    const lon = parseFloat(row['Lon']);
    const key = `${location}|${lat}|${lon}`;

    let node = nodesByKey.get(key);
    if (!node) {
      node = {
        id: order.length,
        location,
        lat,
        lon,
        demandVolume: parseFloat(row['Demand_Volume']) || 0,
        weight: parseFloat(row['Weight']) || 0,
        requiresColdStorage: row['ต้องการรถห้องเย็น']?.trim() === 'ใช่',
        readyTime: parseTimeOnDate(row['Ready_Time'], todayStr),
        dueTime: parseTimeOnDate(row['Due_Time'], todayStr),
        originalReadyString: row['Ready_Time'],
        originalDueString: row['Due_Time'],
      };
      nodesByKey.set(key, node);
      order.push(key);
    }

    const parcelId = row['Parcel_Id']?.trim();
    if (parcelId) {
      const rawTier = row['Parcel_Tier']?.trim() as Parcel['tier'];
      const parcel: Parcel = {
        id: parcelId,
        name: row['Parcel_Name']?.trim() || parcelId,
        tier: VALID_TIERS.includes(rawTier) ? rawTier : 'standard',
        maxExposureMinutes: parseFloat(row['Max_Exposure_Minutes']) || Infinity,
        requiredTemp: {
          min: parseFloat(row['Temp_Min_C']) || 0,
          max: parseFloat(row['Temp_Max_C']) || 0,
        },
      };
      node.parcels = [...(node.parcels ?? []), parcel];
    }
  });

  return order.map(key => nodesByKey.get(key)!);
}

export function readManifestFile(file: File): Promise<RouteNode[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) {
        reject(new Error('Empty file'));
        return;
      }

      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('�')) {
        text = new TextDecoder('windows-874').decode(buffer);
      }

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          try {
            const nodes = parseManifestRows(results.data as Record<string, string>[]);
            if (nodes.some(n => isNaN(n.lat) || isNaN(n.lon))) {
              reject(new Error('Invalid CSV: Missing Lat or Lon columns.'));
              return;
            }
            resolve(nodes);
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Error parsing CSV. Please ensure format is correct.'));
          }
        },
        error: (err: Error) => reject(err),
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
