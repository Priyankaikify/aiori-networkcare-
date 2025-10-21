import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as d3 from "d3";
import { propagate, twoline2satrec, gstime } from "satellite.js";

export default function App() {
  const [tleData, setTleData] = useState([]);
  const [sats, setSats] = useState([]);
  const [groundNodes, setGroundNodes] = useState([]);
  const [stats, setStats] = useState({ mean: 0, median: 0, p95: 0 });
  const [running, setRunning] = useState(false);
  const mapRef = useRef();

  // 1️⃣ Fetch Starlink TLE data
  useEffect(() => {
    fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle")
      .then((res) => res.text())
      .then((text) => {
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const tles = [];
        for (let i = 0; i < lines.length; i += 3) {
          tles.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
        }
        setTleData(tles.slice(0, 40)); // only 40 for performance
      })
      .catch((err) => console.error("TLE fetch error:", err));
  }, []);

  // 2️⃣ Random ground nodes
  useEffect(() => {
    const nodes = d3.range(20).map(() => ({
      lat: Math.random() * 140 - 70,
      lon: Math.random() * 360 - 180,
    }));
    setGroundNodes(nodes);
  }, []);

  const toDegrees = (rad) => (rad * 180) / Math.PI;

  // 3️⃣ Simulation loop (update every 2s)
  useEffect(() => {
    if (!running || tleData.length === 0) return;

    const id = setInterval(() => {
      const now = new Date();
      const gmst = gstime(now);

      const satPositions = tleData
        .map((tle) => {
          const satrec = twoline2satrec(tle.l1, tle.l2);
          const posVel = propagate(satrec, now);
          const pos = posVel.position;
          if (!pos) return null;

          const { x, y, z } = pos;
          const r = Math.sqrt(x * x + y * y);
          const lon = toDegrees(Math.atan2(y, x)) - toDegrees(gmst);
          const lat = toDegrees(Math.atan2(z, r));

          return { lat, lon: ((lon + 540) % 360) - 180 };
        })
        .filter(Boolean);

      setSats(satPositions);

      const latencies = groundNodes.map((g) => {
        let minD = Infinity;
        satPositions.forEach((s) => {
          const d = haversine(g.lat, g.lon, s.lat, s.lon);
          if (d < minD) minD = d;
        });
        return (minD / 300000) * 1000; // ms (light speed in km/s)
      });

      if (latencies.length > 0) {
        const sorted = [...latencies].sort((a, b) => a - b);
        const mean = d3.mean(latencies);
        const median = d3.median(latencies);
        const p95 = d3.quantileSorted(sorted, 0.95);
        setStats({ mean, median, p95 });
      }
    }, 2000);

    return () => clearInterval(id);
  }, [running, tleData, groundNodes]);

  // 4️⃣ Distance helper
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px",
          background: "#111",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>🛰️ LEO Satellite Latency Visualizer</h2>
        <div>
          <button
            style={{
              padding: "8px 12px",
              background: "green",
              color: "white",
              border: "none",
              borderRadius: "6px",
              marginRight: "10px",
              cursor: "pointer",
            }}
            onClick={() => setRunning(true)}
          >
            Start
          </button>
          <button
            style={{
              padding: "8px 12px",
              background: "red",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
            onClick={() => setRunning(false)}
          >
            Stop
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: "100%", width: "100%" }}
          ref={mapRef}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {/* Satellites */}
          {sats.map((s, i) => (
            <CircleMarker
              key={`sat-${i}`}
              center={[s.lat, s.lon]}
              radius={4}
              color="blue"
            >
              <Tooltip>Satellite #{i}</Tooltip>
            </CircleMarker>
          ))}

          {/* Ground Nodes */}
          {groundNodes.map((g, i) => (
            <CircleMarker
              key={`g-${i}`}
              center={[g.lat, g.lon]}
              radius={4}
              color="orange"
            >
              <Tooltip>Ground Node #{i}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Footer Stats */}
      <div
        style={{
          background: "#222",
          color: "white",
          padding: "10px",
          fontSize: "14px",
          textAlign: "center",
        }}
      >
        Satellites: {sats.length} | Ground Nodes: {groundNodes.length} | Mean:{" "}
        {stats.mean.toFixed(2)} ms | Median: {stats.median.toFixed(2)} ms | P95:{" "}
        {stats.p95.toFixed(2)} ms
      </div>
    </div>
  );
}

