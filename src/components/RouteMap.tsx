import React, { useEffect, useState } from 'react';
import { ProcessedData, RouteSummary, RouteLeg } from '../types';
import { MapContainer, TileLayer, Polyline, useMap, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Layers, BarChart3 } from 'lucide-react';

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

export default function RouteMap({ data, onViewAlgorithm }: { data: ProcessedData; onViewAlgorithm?: () => void }) {
  const allRoutes = data.routeSummaries.map(r => r.routeIndex);
  const [activeRouteIndices, setActiveRouteIndices] = useState<number[]>(allRoutes);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

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

  return (
    <div className="relative w-full h-[500px] border border-slate-300 rounded-lg overflow-hidden shadow-md mt-6">
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
          const isActive = data.legs.some(leg => 
            activeRouteIndices.includes(leg.routeIndex) && 
            !leg.isReturnToDepot && 
            leg.toNode.lat === node.lat && 
            leg.toNode.lon === node.lon
          );
          if (!isActive) return null;
          return <Marker key={idx} position={[node.lat, node.lon]} icon={customerIcon} />;
        })}

        {data.legs.map((leg, idx) => {
          if (!activeRouteIndices.includes(leg.routeIndex)) return null;
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

        <MapController legs={data.legs} activeRouteIndices={activeRouteIndices} />
      </MapContainer>

      {/* Floating Filter Menu */}
      <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg border border-slate-200 w-72 overflow-hidden">
        <div 
          className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          <div className="flex items-center font-bold text-[#1E3A8A] text-sm">
            <Layers className="w-4 h-4 mr-2" />
            Route Filter ({activeRouteIndices.length}/{data.routeSummaries.length})
          </div>
        </div>
        
        {isFilterOpen && (
          <div className="p-3 max-h-64 overflow-y-auto space-y-2">
            {data.routeSummaries.map(summary => {
              const isActive = activeRouteIndices.includes(summary.routeIndex);
              return (
                <label key={summary.routeIndex} className="flex items-center space-x-3 cursor-pointer p-1.5 hover:bg-slate-50 rounded">
                  <input 
                    type="checkbox"
                    checked={isActive}
                    onChange={() => toggleRoute(summary.routeIndex)}
                    className="w-4 h-4 text-[#1E3A8A] rounded border-slate-300 focus:ring-[#1E3A8A]"
                  />
                  <div className="flex-1 text-sm font-medium text-slate-700 truncate">
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
          className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-2.5 flex items-center font-bold text-[#1E3A8A] text-sm hover:bg-slate-50 transition-colors"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          View Algorithm
        </button>
      )}
    </div>
  );
}
