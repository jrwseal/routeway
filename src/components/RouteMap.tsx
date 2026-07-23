import React, { useEffect, useMemo, useState } from 'react';
import { ProcessedData, RouteSummary, RouteLeg } from '../types';
import { MapContainer, TileLayer, Polyline, useMap, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Layers, BarChart3 } from 'lucide-react';
import { getProgress, ProgressEntry } from '../lib/api';

function MapController({ legs, activeRouteIndices }: { legs: RouteLeg[], activeRouteIndices: number[] }) {
  const map = useMap();
  useEffect(() => {
    const activeLegs = legs.filter(l => activeRouteIndices.includes(l.routeIndex));
    if (activeLegs.length > 0) {
      const bounds = L.latLngBounds([]);
      activeLegs.forEach(leg => {
        if (leg.geometry && leg.geometry.coordinates) {
          leg.geometry.coordinates.forEach((c: any) => {
            bounds.extend([c[1], c[0]]);
          });
        } else {
          bounds.extend([leg.fromNode.lat, leg.fromNode.lon]);
          bounds.extend([leg.toNode.lat, leg.toNode.lon]);
        }
      });
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [legs, activeRouteIndices, map]);

  return null;
}

export interface EmergencyRerouteView {
  routeIndex: number;
  brokenDownAt: RouteLeg['toNode'];
  originalRemainingLegs: RouteLeg[];
  newLegs: RouteLeg[];
}

export default function RouteMap({
  data,
  onViewAlgorithm,
  emergencyView,
}: {
  data: ProcessedData;
  onViewAlgorithm?: () => void;
  emergencyView?: EmergencyRerouteView | null;
}) {
  const allRoutes = data.routeSummaries.map(r => r.routeIndex);
  const [activeRouteIndices, setActiveRouteIndices] = useState<number[]>(allRoutes);
  const [isFilterOpen, setIsFilterOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getProgress().then(entries => {
        if (!cancelled) setProgress(entries);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Ordered, non-return-to-depot legs per route — a node's index here is its delivery stop number.
  const deliveryLegsByRoute = useMemo(() => {
    const map = new Map<number, RouteLeg[]>();
    for (const leg of data.legs) {
      if (leg.isReturnToDepot) continue;
      const list = map.get(leg.routeIndex) ?? [];
      list.push(leg);
      map.set(leg.routeIndex, list);
    }
    return map;
  }, [data.legs]);

  const isNodeDelivered = (leg: RouteLeg): boolean => {
    const entry = progress.find(p => p.routeIndex === leg.routeIndex);
    if (!entry) return false;
    if (entry.stepState === 'completed') return true;
    const routeLegs = deliveryLegsByRoute.get(leg.routeIndex) ?? [];
    const stepIndex = routeLegs.indexOf(leg);
    return stepIndex !== -1 && entry.currentStep > stepIndex;
  };

  // Sync if data changes
  useEffect(() => {
    setActiveRouteIndices(data.routeSummaries.map(r => r.routeIndex));
  }, [data]);

  const toggleRoute = (routeIndex: number) => {
    setActiveRouteIndices(prev => 
      prev.includes(routeIndex) ? prev.filter(id => id !== routeIndex) : [...prev, routeIndex]
    );
  };

  const getPolylinePositions = (leg: RouteLeg) => {
    if (leg.geometry && leg.geometry.coordinates) {
      return leg.geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
    }
    return [
      [leg.fromNode.lat, leg.fromNode.lon] as [number, number],
      [leg.toNode.lat, leg.toNode.lon] as [number, number]
    ];
  };

  const depot = data.nodes[0];

  const createPinIcon = (color: string, size: number) => L.divIcon({
    html: `
      <div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: ${size}px; height: ${size}px;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="white"></circle>
        </svg>
      </div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size]
  });

  const depotIcon = createPinIcon('black', 32);
  const customerIcon = createPinIcon('#ef4444', 28);
  const coldCustomerIcon = createPinIcon('#06B6D4', 28);
  const deliveredIcon = createPinIcon('var(--color-signal-green)', 28);

  return (
    <div className="relative w-full h-[350px] sm:h-[500px] border border-slate-300 rounded-lg overflow-hidden shadow-md mt-6">
      <MapContainer 
        center={[depot.lat, depot.lon]} 
        zoom={12} 
        className="w-full h-full z-0"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[depot.lat, depot.lon]} icon={depotIcon}>
          <Tooltip direction="top" offset={[0, 0]} opacity={1} permanent className="font-bold text-sm bg-black text-white border-none shadow-md">
            DEPOT
          </Tooltip>
        </Marker>

        {data.nodes.slice(1).map((node, idx) => {
          const leg = data.legs.find(l =>
            activeRouteIndices.includes(l.routeIndex) &&
            !l.isReturnToDepot &&
            l.toNode.lat === node.lat &&
            l.toNode.lon === node.lon
          );
          if (!leg) return null;
          if (isNodeDelivered(leg)) {
            return (
              <Marker key={idx} position={[node.lat, node.lon]} icon={deliveredIcon}>
                <Tooltip direction="top" offset={[0, 0]} opacity={1}>✅ ส่งแล้ว</Tooltip>
              </Marker>
            );
          }
          if (node.requiresColdStorage) {
            return (
              <Marker key={idx} position={[node.lat, node.lon]} icon={coldCustomerIcon}>
                <Tooltip direction="top" offset={[0, 0]} opacity={1}>❄️ ต้องการรถห้องเย็น</Tooltip>
              </Marker>
            );
          }
          return <Marker key={idx} position={[node.lat, node.lon]} icon={customerIcon} />;
        })}

        {data.legs.map((leg, idx) => {
          if (!activeRouteIndices.includes(leg.routeIndex)) return null;
          const isSuperseded = emergencyView?.routeIndex === leg.routeIndex &&
            emergencyView.originalRemainingLegs.some(rl => rl.toNode.lat === leg.toNode.lat && rl.toNode.lon === leg.toNode.lon);
          if (isSuperseded) return null;
          const routeSummary = data.routeSummaries.find(r => r.routeIndex === leg.routeIndex);
          const color = routeSummary?.vehicle.color || '#1E3A8A';
          return (
            <Polyline
              key={idx}
              positions={getPolylinePositions(leg)}
              color={color}
              weight={5}
              opacity={0.8}
            />
          );
        })}

        {emergencyView && emergencyView.originalRemainingLegs.map((leg, idx) => (
          <Polyline
            key={`old-${idx}`}
            positions={getPolylinePositions(leg)}
            color="#94A3B8"
            weight={3}
            opacity={0.35}
            dashArray="6 8"
          />
        ))}

        {emergencyView && emergencyView.newLegs.map((leg, idx) => (
          <Polyline
            key={`new-${idx}`}
            positions={getPolylinePositions(leg)}
            color="#F2545B"
            weight={6}
            opacity={0.95}
          />
        ))}

        {emergencyView && (
          <Marker
            position={[emergencyView.brokenDownAt.lat, emergencyView.brokenDownAt.lon]}
            icon={L.divIcon({
              html: `<div style="font-size:26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🚨</div>`,
              className: '',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            })}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent className="font-bold text-xs bg-alert-red text-white border-none shadow-md">
              รถเสีย ณ จุดนี้
            </Tooltip>
          </Marker>
        )}

        <MapController legs={data.legs} activeRouteIndices={activeRouteIndices} />
      </MapContainer>

      {/* Floating Filter Menu */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[1000] bg-white rounded-lg shadow-lg border border-slate-200 w-56 sm:w-72 max-w-[calc(100%-1rem)] overflow-hidden">
        <button
          type="button"
          aria-expanded={isFilterOpen}
          aria-controls="route-filter-list"
          className="w-full bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-fleet-navy focus:ring-inset"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          <div className="flex items-center font-bold text-fleet-navy text-sm">
            <Layers className="w-4 h-4 mr-2" />
            Route Filter ({activeRouteIndices.length}/{data.routeSummaries.length})
          </div>
        </button>
        
        {isFilterOpen && (
          <div id="route-filter-list" className="p-3 max-h-64 overflow-y-auto space-y-2">
            {data.routeSummaries.map(summary => {
              const isActive = activeRouteIndices.includes(summary.routeIndex);
              const hasColdStop = data.legs.some(leg => leg.routeIndex === summary.routeIndex && leg.toNode.requiresColdStorage);
              return (
                <label key={summary.routeIndex} className="flex items-center space-x-3 cursor-pointer p-1.5 hover:bg-slate-50 rounded">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleRoute(summary.routeIndex)}
                    className="w-4 h-4 text-fleet-navy rounded border-slate-300 focus:ring-fleet-navy"
                  />
                  <div className="flex-1 text-sm font-medium text-slate-700 truncate flex items-center gap-1">
                    {hasColdStop && <span title="มีจุดส่งที่ต้องการรถห้องเย็น">❄️</span>}
                    {summary.vehicle.name}
                  </div>
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: summary.vehicle.color }} />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* View Algorithm Button */}
      {onViewAlgorithm && (
        <button
          onClick={onViewAlgorithm}
          className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 z-[1000] bg-white rounded-lg shadow-lg border border-slate-200 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center font-bold text-fleet-navy text-xs sm:text-sm hover:bg-slate-50 transition-colors"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          View Algorithm
        </button>
      )}
    </div>
  );
}
