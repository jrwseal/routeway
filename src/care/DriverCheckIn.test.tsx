import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DriverCheckIn from './DriverCheckIn';
import type { RouteNode, Parcel } from '../types';

const node: RouteNode = {
  id: 1, location: 'ศูนย์อนามัยบ้านสวน', lat: 13.36, lon: 100.98,
  demandVolume: 1, weight: 1, requiresColdStorage: true, readyTime: null, dueTime: null,
};

const parcel: Parcel = {
  id: 'PCL-006', name: 'พลาสมาเลือด', tier: 'critical', maxExposureMinutes: 30,
  requiredTemp: { min: 2, max: 6 },
};

describe('DriverCheckIn', () => {
  it('renders the target location, parcel, and a disabled confirm button without GPS', () => {
    const html = renderToStaticMarkup(<DriverCheckIn target={{ node, parcel }} />);

    expect(html).toContain('RouteWay Care');
    expect(html).toContain(node.location);
    expect(html).toContain(parcel.name);
    expect(html).toContain('ยืนยันส่งมอบ');
    expect(html).toContain('80 เมตร');
  });

  it('respects a custom geofence radius', () => {
    const html = renderToStaticMarkup(<DriverCheckIn target={{ node, parcel }} geofenceRadiusMeters={50} />);
    expect(html).toContain('50 เมตร');
  });
});
