import React, { useCallback, useMemo, useState } from 'react';
import { MapPin, Navigation, CheckCircle2, XCircle, Clock, Gauge } from 'lucide-react';
import type { Parcel, RouteNode } from '../types';
import { distanceMeters, statusFromDistance, type GeofenceStatus } from '../lib/geofence';
import { useGeolocation } from './useGeolocation';
import { getDeliveryLog, appendDeliveryLog, type DeliveryLogEntry } from './deliveryLog';

const COLORS = {
  bg: '#0B2545',
  surface: '#0F2E52',
  cool: '#3EC1D3',
  warn: '#FFC857',
  critical: '#F2545B',
  muted: '#9AA7BD',
};

const GAUGE_MAX_M = 500;

function statusColor(status: GeofenceStatus): string {
  if (status === 'in-range') return COLORS.cool;
  if (status === 'near') return COLORS.warn;
  return COLORS.critical;
}

function statusLabel(status: GeofenceStatus): string {
  if (status === 'in-range') return 'อยู่ในระยะที่ยืนยันได้';
  if (status === 'near') return 'ใกล้ถึงแล้ว เดินเข้าไปอีกนิด';
  return 'ยังอยู่ไกลจากจุดส่งมอบ';
}

interface DriverCheckInTarget {
  node: RouteNode;
  parcel: Parcel;
  plannedTime?: Date | null;
}

interface DriverCheckInProps {
  target: DriverCheckInTarget;
  geofenceRadiusMeters?: number;
}

export default function DriverCheckIn({ target, geofenceRadiusMeters = 80 }: DriverCheckInProps) {
  const { coords, error } = useGeolocation();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [log, setLog] = useState<DeliveryLogEntry[]>(() => getDeliveryLog());

  const distance = coords
    ? distanceMeters(coords, { lat: target.node.lat, lon: target.node.lon })
    : null;
  const status: GeofenceStatus = distance !== null ? statusFromDistance(distance, geofenceRadiusMeters) : 'far';
  const canConfirm = status === 'in-range' && !confirmed && coords !== null;

  const handleConfirm = useCallback(() => {
    if (!canConfirm || !coords || distance === null) return;
    const now = new Date();
    const entry: DeliveryLogEntry = {
      parcelId: target.parcel.id,
      plannedTime: target.plannedTime ? target.plannedTime.toISOString() : null,
      actualTime: now.toISOString(),
      actualCoordinates: { lat: coords.lat, lon: coords.lon },
      distanceAtConfirm: Math.round(distance),
    };
    setLog(appendDeliveryLog(entry));
    setConfirmed(true);
    setConfirmedAt(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
  }, [canConfirm, coords, distance, target]);

  const onTimeCount = useMemo(
    () =>
      log.filter(l => {
        if (!l.plannedTime) return true;
        return new Date(l.actualTime).getTime() <= new Date(l.plannedTime).getTime() + 10 * 60000;
      }).length,
    [log],
  );
  const onTimeRate = log.length ? Math.round((onTimeCount / log.length) * 100) : 0;

  const ringOffset = 2 * Math.PI * 60 * (1 - Math.max(0, 1 - (distance ?? GAUGE_MAX_M) / GAUGE_MAX_M));

  return (
    <div style={{ backgroundColor: COLORS.bg, minHeight: '100vh', fontFamily: 'var(--font-care-body)' }} className="w-full flex justify-center py-6 px-4">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontFamily: 'var(--font-care-heading)', color: 'white' }} className="text-lg font-bold leading-none">
              RouteWay Care
            </p>
            <p style={{ color: COLORS.muted }} className="text-xs mt-1">
              Driver Check-in
            </p>
          </div>
          <div
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
          >
            <Gauge size={13} color={COLORS.cool} />
            <span style={{ color: 'white', fontFamily: 'var(--font-care-mono)' }} className="text-xs">
              GPS {coords ? `±${Math.round(coords.accuracy)}m` : error ?? '—'}
            </span>
          </div>
        </div>

        <div style={{ backgroundColor: COLORS.surface, border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={16} color={COLORS.cool} />
            <p style={{ color: 'white' }} className="text-sm font-semibold">
              {target.node.location}
            </p>
          </div>
          <div
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            className="rounded-lg mt-3 px-3 py-2 flex items-center justify-between"
          >
            <span style={{ color: COLORS.muted }} className="text-xs">
              พัสดุ
            </span>
            <span style={{ color: 'white' }} className="text-xs font-medium">
              {target.parcel.name}
            </span>
          </div>
        </div>

        <div style={{ backgroundColor: COLORS.surface, border: `1px solid ${statusColor(status)}55` }} className="rounded-2xl p-5 flex flex-col items-center">
          <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
              <circle
                cx="70"
                cy="70"
                r="60"
                fill="none"
                stroke={statusColor(status)}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 60}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <Navigation size={18} color={statusColor(status)} style={{ transform: 'rotate(20deg)' }} />
              <p style={{ color: 'white', fontFamily: 'var(--font-care-mono)' }} className="text-2xl font-bold mt-1 leading-none">
                {distance !== null ? Math.round(distance) : '—'}
              </p>
              <p style={{ color: COLORS.muted }} className="text-[11px] mt-0.5">
                เมตรจากจุดส่ง
              </p>
            </div>
          </div>

          <p style={{ color: statusColor(status) }} className="text-xs font-semibold mt-3">
            {statusLabel(status)}
          </p>
          <p style={{ color: COLORS.muted }} className="text-[11px] mt-0.5">
            ต้องอยู่ในระยะ {geofenceRadiusMeters} เมตรถึงจะกดยืนยันได้
          </p>
        </div>

        {!confirmed ? (
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              backgroundColor: canConfirm ? COLORS.cool : 'rgba(255,255,255,0.08)',
              color: canConfirm ? COLORS.bg : COLORS.muted,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
            className="rounded-xl py-3.5 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {canConfirm ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            ยืนยันส่งมอบ
          </button>
        ) : (
          <div style={{ backgroundColor: 'rgba(62,193,211,0.12)', border: `1px solid ${COLORS.cool}` }} className="rounded-xl py-3.5 px-4 flex items-center gap-2">
            <CheckCircle2 size={18} color={COLORS.cool} />
            <div>
              <p style={{ color: COLORS.cool }} className="text-sm font-semibold">
                ส่งมอบสำเร็จ เวลา {confirmedAt}
              </p>
              <p style={{ color: COLORS.muted }} className="text-[11px]">
                บันทึกพิกัดจริง + timestamp เรียบร้อย
              </p>
            </div>
          </div>
        )}

        <div style={{ backgroundColor: COLORS.surface, border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: 'white' }} className="text-sm font-semibold">
              Performance วันนี้
            </p>
            <div className="flex items-center gap-1.5">
              <Clock size={13} color={COLORS.cool} />
              <span style={{ color: COLORS.cool, fontFamily: 'var(--font-care-mono)' }} className="text-xs font-bold">
                {onTimeRate}% ตรงเวลา
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {log.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-xs">
                ยังไม่มีการยืนยันส่งมอบวันนี้
              </p>
            )}
            {log.map((item, i) => (
              <div key={`${item.parcelId}-${i}`} style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} className="rounded-lg px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p style={{ color: 'white' }} className="text-xs font-medium truncate">
                    {item.parcelId}
                  </p>
                  <p style={{ color: COLORS.muted }} className="text-[10px]">
                    จริง {new Date(item.actualTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · ห่างจุด {item.distanceAtConfirm}ม.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
