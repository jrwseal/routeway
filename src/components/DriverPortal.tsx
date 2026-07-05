import React, { useEffect, useState, useRef } from "react";
import { ProcessedData, RouteLeg } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import {
  Navigation,
  Clock,
  PackageCheck,
  AlertCircle,
  MapPin,
  Truck,
} from "lucide-react";
import { format } from "date-fns";

// Create custom icons for Depot, Next Stop
const createPinIcon = (color: string, size: number) =>
  L.divIcon({
    html: `
    <div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: ${size}px; height: ${size}px;">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="white"></circle>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    tooltipAnchor: [0, -size],
  });

const depotIcon = createPinIcon("black", 32);
const customerIcon = createPinIcon("#ef4444", 28);
const visitedCustomerIcon = createPinIcon("#10b981", 28);

// Component to handle map bounds and resizing
function MapController({ leg }: { leg: RouteLeg | null }) {
  const map = useMap();
  useEffect(() => {
    if (leg) {
      if (leg.geometry && leg.geometry.coordinates) {
        // geometry.coordinates is [lon, lat][]
        const latsAndLons = leg.geometry.coordinates.map(
          (c: any) => [c[1], c[0]] as [number, number],
        );
        if (latsAndLons.length > 0) {
          const bounds = L.latLngBounds(latsAndLons);
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } else {
        const bounds = L.latLngBounds([
          [leg.fromNode.lat, leg.fromNode.lon],
          [leg.toNode.lat, leg.toNode.lon],
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [leg, map]);

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  return null;
}

interface DriverPortalProps {
  data: ProcessedData;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  stepState: "pending" | "in_transit";
  setStepState: (state: "pending" | "in_transit") => void;
}

export default function DriverPortal({
  data,
  currentStep,
  setCurrentStep,
  stepState,
  setStepState,
}: DriverPortalProps) {
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(
    data.routeSummaries[0]?.routeIndex || 1,
  );

  useEffect(() => {
    if (data && data.routeSummaries.length > 0) {
      // Keep the current selection if it still exists in the new data, otherwise reset
      const exists = data.routeSummaries.some(
        (r) => r.routeIndex === selectedRouteIndex,
      );
      if (!exists) {
        setSelectedRouteIndex(data.routeSummaries[0].routeIndex);
        setCurrentStep(0);
        setStepState("pending");
      }
    }
  }, [data, selectedRouteIndex, setCurrentStep, setStepState]);

  const handleRouteSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRouteIndex(Number(e.target.value));
    setCurrentStep(0);
    setStepState("pending");
  };

  const selectedRouteSummary = data.routeSummaries.find(
    (r) => r.routeIndex === selectedRouteIndex,
  );
  const routeLegs = data.legs.filter(
    (leg) => leg.routeIndex === selectedRouteIndex,
  );

  const isCompleted = currentStep >= routeLegs.length;
  const activeLeg = isCompleted ? null : routeLegs[currentStep];

  const handleNextStep = () => {
    setCurrentStep(currentStep + 1);
    setStepState("pending");
  };

  // Convert GeoJSON geometry (array of [lon, lat]) to Leaflet Polyline (array of [lat, lon])
  const getPolylinePositions = (leg: RouteLeg) => {
    if (leg.geometry && leg.geometry.coordinates) {
      return leg.geometry.coordinates.map(
        (c: any) => [c[1], c[0]] as [number, number],
      );
    }
    return [
      [leg.fromNode.lat, leg.fromNode.lon] as [number, number],
      [leg.toNode.lat, leg.toNode.lon] as [number, number],
    ];
  };

  return (
    <div className="p-4 sm:p-8 pb-20 animate-fade-in w-full max-w-7xl mx-auto flex flex-col lg:h-[calc(100vh-2rem)]">
      <div className="mb-6 flex-shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-fleet-navy mb-2">RouteWay</h1>
          <p className="text-lg font-medium text-slate-600">
            Interactive Driver Portal
          </p>
        </div>

        {data.routeSummaries.length > 0 ? (
          <div className="flex items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
            <label className="text-sm font-bold text-slate-700 mr-3 whitespace-nowrap">
              เลือกยานพาหนะ
            </label>
            <select
              value={selectedRouteIndex}
              onChange={handleRouteSelect}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white font-medium text-fleet-navy outline-none focus:ring-2 focus:ring-fleet-navy"
            >
              {data.routeSummaries.map((r) => (
                <option key={r.routeIndex} value={r.routeIndex}>
                  {r.vehicle.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-sm text-slate-500 italic">
            Please upload a CSV manifest first
          </div>
        )}
      </div>

      {isCompleted ? (
        <Card className="bg-[#F0FDF4] border-signal-green shadow-md flex-shrink-0">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-signal-green bg-opacity-20 rounded-full flex items-center justify-center mb-6">
              <PackageCheck className="w-10 h-10 text-signal-green" />
            </div>
            <h2 className="text-3xl font-bold text-fleet-navy mb-2">
              🎉 Tour Completed Successfully
            </h2>
            <p className="text-slate-600 text-lg">
              All manifest stops have been visited and the vehicle has returned
              to the Depot.
            </p>
            <button
              onClick={() => setCurrentStep(0)}
              className="mt-6 bg-fleet-navy hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center cursor-pointer"
            >
              <span className="mr-2">🔄</span> Reset and Restart New Tour
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Active Navigation Panel */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6 flex-shrink-0 overflow-y-auto pr-2">
            <Card className="border border-fleet-navy shadow-md">
              <CardHeader className="pb-2 bg-slate-50 border-b">
                <CardTitle className="text-xs uppercase tracking-wider text-slate-500 font-semibold flex items-center">
                  <Navigation className="w-4 h-4 mr-2" />
                  Current Target Destination
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">
                  {activeLeg?.toNode.location}
                </h2>

                <div className="space-y-4 mb-6">
                  <div className="flex items-start">
                    <Clock className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Est. Arrival Time
                      </p>
                      <p className="text-lg font-semibold text-fleet-navy">
                        {activeLeg?.arrivalDate
                          ? format(activeLeg.arrivalDate, "HH:mm")
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {activeLeg?.toNode.dueTime && (
                    <div className="flex items-start">
                      <AlertCircle className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          Strict Time Window
                        </p>
                        <p
                          className={`text-md font-semibold ${
                            activeLeg.status === "Delayed"
                              ? "text-alert-red"
                              : "text-slate-700"
                          }`}
                        >
                          {activeLeg.toNode.originalReadyString || "Any"} -{" "}
                          {activeLeg.toNode.originalDueString || "Any"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start">
                    <PackageCheck className="w-5 h-5 text-slate-400 mr-3 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Delivery Load
                      </p>
                      <p className="text-md font-semibold text-slate-700">
                        {activeLeg?.toNode.demandVolume} CBM /{" "}
                        {activeLeg?.toNode.weight} kg
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-100 p-3 rounded-md mb-6 flex justify-between text-sm">
                  <div className="text-slate-600 font-medium">
                    Leg Distance:
                  </div>
                  <div className="font-bold text-fleet-navy">
                    {activeLeg?.distanceKm.toFixed(1)} km
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {activeLeg && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${activeLeg.toNode.lat},${activeLeg.toNode.lon}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-slate-100 hover:bg-slate-200 text-fleet-navy font-bold py-3 px-4 rounded-lg shadow-sm transition-all active:scale-[0.98] flex items-center justify-center border border-slate-300"
                    >
                      <MapPin className="w-5 h-5 mr-2" />
                      นำทาง
                    </a>
                  )}

                  {stepState === "pending" ? (
                    <button
                      onClick={() => setStepState("in_transit")}
                      className="w-full bg-amber-warning hover:bg-amber-warning-deep text-white font-bold py-4 px-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center"
                    >
                      <Navigation className="w-5 h-5 mr-2" />
                      กำลังไปส่ง
                    </button>
                  ) : (
                    <button
                      onClick={handleNextStep}
                      className="w-full bg-signal-green hover:bg-signal-green-hover text-white font-bold py-4 px-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center"
                    >
                      <PackageCheck className="w-5 h-5 mr-2" />
                      ส่งเสร็จแล้ว
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1 min-h-[300px] flex flex-col">
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-md font-bold text-fleet-navy">
                  Sequenced Manifest Activity
                </CardTitle>
              </CardHeader>
              <div className="overflow-y-auto p-4 flex-1">
                <div className="space-y-4">
                  {routeLegs.map((leg, index) => {
                    const isPast = index < currentStep;
                    const isActive = index === currentStep;

                    return (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          isActive
                            ? "bg-[#EFF6FF] border-[#BFDBFE]"
                            : isPast
                              ? "bg-slate-50 border-slate-200 opacity-60"
                              : "bg-white border-slate-200"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span
                            className={`font-bold text-sm ${isActive ? "text-fleet-navy" : "text-slate-700"}`}
                          >
                            {index + 1}. {leg.toNode.location}
                          </span>
                          {isPast ? (
                            <span
                              className="text-xs bg-[#D1FAE5] px-2 py-0.5 rounded flex items-center"
                              style={{ color: "#10B981", fontWeight: "bold" }}
                            >
                              ✅ ส่งเสร็จแล้ว
                            </span>
                          ) : isActive && stepState === "in_transit" ? (
                            <span className="text-xs bg-[#FEF3C7] px-2 py-0.5 rounded flex items-center text-amber-warning-deep font-bold">
                              🚚 กำลังไปส่ง
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500">
                          {leg.distanceKm.toFixed(1)} km • Arrival:{" "}
                          {leg.arrivalDate
                            ? format(leg.arrivalDate, "HH:mm")
                            : "N/A"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* Map Portal */}
          <div className="w-full lg:w-2/3 h-[350px] sm:h-[500px] lg:h-auto border border-slate-300 rounded-lg overflow-hidden shadow-md flex-shrink-0 relative">
            {activeLeg && (
              <MapContainer
                center={[activeLeg.fromNode.lat, activeLeg.fromNode.lon]}
                zoom={13}
                className="w-full h-full"
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <Marker
                  position={[activeLeg.fromNode.lat, activeLeg.fromNode.lon]}
                  icon={currentStep === 0 ? depotIcon : visitedCustomerIcon}
                >
                  {currentStep === 0 && (
                    <Tooltip
                      direction="top"
                      offset={[0, 0]}
                      opacity={1}
                      permanent
                      className="font-bold text-sm bg-black text-white border-none shadow-md"
                    >
                      DEPOT
                    </Tooltip>
                  )}
                  <Popup>
                    <strong>{activeLeg.fromNode.location}</strong>
                    <br />
                    Current Location
                  </Popup>
                </Marker>

                <Marker
                  position={[activeLeg.toNode.lat, activeLeg.toNode.lon]}
                  icon={
                    currentStep === routeLegs.length - 1
                      ? depotIcon
                      : customerIcon
                  }
                >
                  {currentStep === routeLegs.length - 1 && (
                    <Tooltip
                      direction="top"
                      offset={[0, 0]}
                      opacity={1}
                      permanent
                      className="font-bold text-sm bg-black text-white border-none shadow-md"
                    >
                      DEPOT
                    </Tooltip>
                  )}
                  <Popup>
                    <strong>{activeLeg.toNode.location}</strong>
                    <br />
                    Target Destination
                  </Popup>
                </Marker>

                <Polyline
                  positions={getPolylinePositions(activeLeg)}
                  color="#1E3A8A"
                  weight={5}
                  opacity={0.8}
                />

                <MapController leg={activeLeg} />
              </MapContainer>
            )}

            {/* Overlay Gradient for polish */}
            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-black/10 to-transparent pointer-events-none z-[1000]"></div>
          </div>
        </div>
      )}
    </div>
  );
}
