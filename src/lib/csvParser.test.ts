import { describe, it, expect } from 'vitest';
import { parseManifestRows } from './csvParser';

describe('parseManifestRows', () => {
  it('parses legacy one-row-per-node CSVs with no parcel columns', () => {
    const rows = [
      { Location: 'Depot', Lat: '13.7', Lon: '100.5', Demand_Volume: '0', Weight: '0', Ready_Time: '08:00', Due_Time: '17:00' },
      { Location: 'Stop A', Lat: '13.8', Lon: '100.6', Demand_Volume: '5', Weight: '10', Ready_Time: '09:00', Due_Time: '12:00' },
    ];
    const nodes = parseManifestRows(rows);

    expect(nodes).toHaveLength(2);
    expect(nodes[1].location).toBe('Stop A');
    expect(nodes[1].demandVolume).toBe(5);
    expect(nodes[1].parcels).toBeUndefined();
  });

  it('reads the cold-storage flag from the Thai column', () => {
    const rows = [
      { Location: 'Stop A', Lat: '13.8', Lon: '100.6', 'ต้องการรถห้องเย็น': 'ใช่' },
    ];
    expect(parseManifestRows(rows)[0].requiresColdStorage).toBe(true);
  });

  it('groups multiple parcel rows sharing the same location into one node', () => {
    const rows = [
      {
        Location: 'รพ.สต. บ้านนา', Lat: '13.167', Lon: '100.922', Demand_Volume: '3', Weight: '8',
        Ready_Time: '09:00', Due_Time: '12:00',
        Parcel_Id: 'PCL-001', Parcel_Name: 'วัคซีน', Parcel_Tier: 'critical',
        Max_Exposure_Minutes: '30', Temp_Min_C: '2', Temp_Max_C: '8',
      },
      {
        Location: 'รพ.สต. บ้านนา', Lat: '13.167', Lon: '100.922', Demand_Volume: '3', Weight: '8',
        Ready_Time: '09:00', Due_Time: '12:00',
        Parcel_Id: 'PCL-002', Parcel_Name: 'พาราเซตามอล', Parcel_Tier: 'standard',
        Max_Exposure_Minutes: '180', Temp_Min_C: '15', Temp_Max_C: '25',
      },
    ];
    const nodes = parseManifestRows(rows);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].parcels).toHaveLength(2);
    expect(nodes[0].parcels?.[0]).toEqual({
      id: 'PCL-001', name: 'วัคซีน', tier: 'critical', maxExposureMinutes: 30,
      requiredTemp: { min: 2, max: 8 },
    });
    expect(nodes[0].parcels?.[1].tier).toBe('standard');
  });

  it('keeps rows at distinct locations as separate nodes even with parcel columns present', () => {
    const rows = [
      { Location: 'Stop A', Lat: '13.1', Lon: '100.1', Parcel_Id: 'PCL-001', Parcel_Tier: 'critical' },
      { Location: 'Stop B', Lat: '13.2', Lon: '100.2', Parcel_Id: 'PCL-002', Parcel_Tier: 'low' },
    ];
    const nodes = parseManifestRows(rows);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].parcels).toHaveLength(1);
    expect(nodes[1].parcels).toHaveLength(1);
  });

  it('defaults an invalid or missing tier to standard', () => {
    const rows = [{ Location: 'Stop A', Lat: '13.1', Lon: '100.1', Parcel_Id: 'PCL-001', Parcel_Tier: 'urgent' }];
    expect(parseManifestRows(rows)[0].parcels?.[0].tier).toBe('standard');
  });

  it('defaults maxExposureMinutes to Infinity when missing', () => {
    const rows = [{ Location: 'Stop A', Lat: '13.1', Lon: '100.1', Parcel_Id: 'PCL-001' }];
    expect(parseManifestRows(rows)[0].parcels?.[0].maxExposureMinutes).toBe(Infinity);
  });

  it('ignores rows with a blank Parcel_Id even when the column is present', () => {
    const rows = [{ Location: 'Stop A', Lat: '13.1', Lon: '100.1', Parcel_Id: '' }];
    expect(parseManifestRows(rows)[0].parcels).toBeUndefined();
  });
});
