import { RouteNode } from '../types';

function todayAt(hh: number, mm: number): Date {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

export const careSampleNodes: RouteNode[] = [
  {
    id: 0,
    location: 'คลังยาเย็น ศรีราชา (Depot)',
    lat: 13.27966375,
    lon: 100.9254967,
    demandVolume: 0,
    weight: 0,
    requiresColdStorage: false,
    readyTime: todayAt(8, 0),
    dueTime: todayAt(17, 0),
  },
  {
    id: 1,
    location: 'รพ.สต. บ้านนา ศรีราชา',
    lat: 13.16701,
    lon: 100.92228,
    demandVolume: 3.5,
    weight: 12,
    requiresColdStorage: true,
    readyTime: todayAt(9, 0),
    dueTime: todayAt(12, 0),
    parcels: [
      {
        id: 'PCL-001',
        name: 'วัคซีนไข้หวัดใหญ่ (กล่อง 50 โดส)',
        tier: 'critical',
        maxExposureMinutes: 30,
        requiredTemp: { min: 2, max: 8 },
      },
      {
        id: 'PCL-002',
        name: 'ยาลดไข้พาราเซตามอล (แผง 1000 เม็ด)',
        tier: 'standard',
        maxExposureMinutes: 180,
        requiredTemp: { min: 15, max: 25 },
      },
    ],
  },
  {
    id: 2,
    location: 'คลินิกเวชกรรมแสนสุข',
    lat: 13.105309,
    lon: 100.93741,
    demandVolume: 2,
    weight: 6,
    requiresColdStorage: true,
    readyTime: todayAt(10, 0),
    dueTime: todayAt(13, 0),
    parcels: [
      {
        id: 'PCL-003',
        name: 'เลือดกรุ๊ป O (ถุงบรรจุ 4 หน่วย)',
        tier: 'critical',
        maxExposureMinutes: 20,
        requiredTemp: { min: 2, max: 6 },
      },
    ],
  },
  {
    id: 3,
    location: 'ร้านขายยาบางแสน',
    lat: 13.283645,
    lon: 100.921934,
    demandVolume: 4,
    weight: 9,
    requiresColdStorage: true,
    readyTime: todayAt(8, 30),
    dueTime: todayAt(11, 30),
    parcels: [
      {
        id: 'PCL-004',
        name: 'อินซูลิน (ขวด 10 มล. x20)',
        tier: 'standard',
        maxExposureMinutes: 90,
        requiredTemp: { min: 2, max: 8 },
      },
      {
        id: 'PCL-005',
        name: 'ผ้าพันแผลปลอดเชื้อ',
        tier: 'low',
        maxExposureMinutes: 480,
        requiredTemp: { min: 15, max: 30 },
      },
    ],
  },
  {
    id: 4,
    location: 'ศูนย์สุขภาพชุมชนพัทยา',
    lat: 13.080137,
    lon: 100.964975,
    demandVolume: 5,
    weight: 14,
    requiresColdStorage: false,
    readyTime: todayAt(13, 0),
    dueTime: todayAt(16, 0),
    parcels: [
      {
        id: 'PCL-006',
        name: 'ชุดตรวจ ATK',
        tier: 'low',
        maxExposureMinutes: 600,
        requiredTemp: { min: 15, max: 30 },
      },
      {
        id: 'PCL-007',
        name: 'เวชภัณฑ์ทั่วไป (สำลี, ถุงมือ)',
        tier: 'low',
        maxExposureMinutes: 600,
        requiredTemp: { min: 15, max: 30 },
      },
    ],
  },
];
