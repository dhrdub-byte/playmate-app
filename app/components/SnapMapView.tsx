'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Users, Trophy, Building2, LocateFixed } from 'lucide-react';

export type ActivePlayerPin = {
  key: string;
  name: string;
  sport: string;
  lat: number;
  lng: number;
  isMe?: boolean;
};

export type MapEventItem = {
  id: string;
  title: string;
  sport: string;
  venue: string;
  event_time: string;
  max_players: number;
  joined_count: number;
  host_lat?: number | null;
  host_lng?: number | null;
  distance_km: number;
};

export type MapGroundItem = {
  id: string;
  name: string;
  sport: string;
  location_label: string;
  price_per_hour: number;
  latitude?: number | null;
  longitude?: number | null;
};

type SnapMapViewProps = {
  userCoords: { lat: number; lng: number } | null;
  activePlayers: ActivePlayerPin[];
  events: MapEventItem[];
  grounds: MapGroundItem[];
  onEnableLocation: () => void;
};

export default function SnapMapView({
  userCoords,
  activePlayers,
  events,
  grounds,
  onEnableLocation,
}: SnapMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [showPlayers, setShowPlayers] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showGrounds, setShowGrounds] = useState(true);

  const defaultCenter: [number, number] = userCoords
    ? [userCoords.lat, userCoords.lng]
    : [30.7333, 76.7794];

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (userCoords && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userCoords.lat, userCoords.lng], 14, { animate: true });
    }
  }, [userCoords?.lat, userCoords?.lng]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (showPlayers) {
      activePlayers.forEach((p, idx) => {
        const offsetLat = p.lat + (idx % 3) * 0.0004;
        const offsetLng = p.lng + Math.floor(idx / 3) * 0.0004;

        const playerIcon = L.divIcon({
          className: 'playmate-snap-pin',
          html: `<div style="
            display:flex;align-items:center;gap:5px;
            background:${p.isMe ? '#10b981' : '#0f172a'};
            color:${p.isMe ? '#020617' : '#f8fafc'};
            border:2px solid ${p.isMe ? '#ecfdf5' : '#38bdf8'};
            padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;
            white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,0.45);
          ">
            <span style="width:7px;height:7px;border-radius:999px;background:${
              p.isMe ? '#020617' : '#22c55e'
            };display:inline-block;"></span>
            <span>${p.name}</span>
          </div>`,
          iconSize: [110, 28],
          iconAnchor: [55, 14],
        });

        L.marker([offsetLat, offsetLng], { icon: playerIcon })
          .bindPopup(
            `<strong>${p.name}</strong><br/>Active for ${p.sport}${p.isMe ? ' (You)' : ''}`
          )
          .addTo(layer);
      });
    }

    if (showEvents) {
      events.forEach((ev, i) => {
        const lat =
          ev.host_lat ??
          (userCoords ? userCoords.lat + 0.004 * ((i % 4) - 1.5) : 30.736 + i * 0.003);
        const lng =
          ev.host_lng ??
          (userCoords ? userCoords.lng + 0.004 * (Math.floor(i / 2) - 1) : 76.782 + i * 0.003);

        const eventIcon = L.divIcon({
          className: 'playmate-event-pin',
          html: `<div style="
            background:#f59e0b;color:#09090b;border:2px solid #fef3c7;
            padding:5px 10px;border-radius:12px;font-size:11px;font-weight:800;
            white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,0.5);
          ">
            ⚽ ${ev.title} (${ev.joined_count}/${ev.max_players})
          </div>`,
          iconSize: [150, 30],
          iconAnchor: [75, 15],
        });

        L.marker([lat, lng], { icon: eventIcon })
          .bindPopup(
            `<strong>${ev.title}</strong> (${ev.sport})<br/>Venue: ${ev.venue}<br/>Time: ${ev.event_time}<br/>Players: ${ev.joined_count}/${ev.max_players}`
          )
          .addTo(layer);
      });
    }

    if (showGrounds) {
      grounds.forEach((gr, i) => {
        const lat =
          gr.latitude ??
          (userCoords ? userCoords.lat - 0.0035 * ((i % 3) + 1) : 30.729 - i * 0.003);
        const lng =
          gr.longitude ??
          (userCoords ? userCoords.lng + 0.0035 * ((i % 3) + 1) : 76.775 + i * 0.003);

        const groundIcon = L.divIcon({
          className: 'playmate-ground-pin',
          html: `<div style="
            background:#6366f1;color:#ffffff;border:2px solid #e0e7ff;
            padding:5px 10px;border-radius:12px;font-size:11px;font-weight:800;
            white-space:nowrap;box-shadow:0 8px 20px rgba(0,0,0,0.5);
          ">
            🏟️ ${gr.name} • ₹${gr.price_per_hour}/hr
          </div>`,
          iconSize: [160, 30],
          iconAnchor: [80, 15],
        });

        L.marker([lat, lng], { icon: groundIcon })
          .bindPopup(
            `<strong>${gr.name}</strong> (${gr.sport})<br/>Area: ${gr.location_label}<br/>Rent: ₹${gr.price_per_hour}/hr`
          )
          .addTo(layer);
      });
    }
  }, [activePlayers, events, grounds, userCoords, showPlayers, showEvents, showGrounds]);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden mb-8 shadow-xl shadow-black/30">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {activePlayers.length} Active Players Live
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full">
            <Trophy className="w-3.5 h-3.5" /> {events.length} Live Matches
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full">
            <Building2 className="w-3.5 h-3.5" /> {grounds.length} Rental Grounds
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => setShowPlayers((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              showPlayers
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 inline mr-1" />
            Players
          </button>
          <button
            type="button"
            onClick={() => setShowEvents((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              showEvents
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            Matches
          </button>
          <button
            type="button"
            onClick={() => setShowGrounds((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
              showGrounds
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            Grounds
          </button>
          <button
            type="button"
            onClick={onEnableLocation}
            className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5 inline mr-1" />
            {userCoords ? 'Re-center Me' : 'Center on Me'}
          </button>
        </div>
      </div>

      <div className="relative h-[400px] w-full">
        <div ref={mapContainerRef} className="h-full w-full z-0" />
        <div className="pointer-events-none absolute bottom-3 left-3 z-[400] bg-slate-950/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-slate-300 flex items-center gap-3 flex-wrap shadow-lg">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> You / Active Player
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Live Match
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" /> Ground for Rent
          </span>
        </div>
      </div>
    </div>
  );
}