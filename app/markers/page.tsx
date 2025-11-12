'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, MapRef, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

type Trip = {
  vendor: number
  path: [number, number][]
  timestamps: number[]
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYWwyMjJjdiIsImEiOiJjbWdxdDE2YjgxcmJiMmxzYTF0NTd3dms2In0.tV0s1khLrqHzPDbOZUciNg'
const MAP_STYLE = 'mapbox://styles/mapbox/standard'

const INITIAL_VIEW = {
  longitude: -74.0,
  latitude: 40.73,
  zoom: 11
}

function interpolatePosition(path: [number, number][], timestamps: number[], t: number): [number, number] {
  if (timestamps.length === 0 || path.length === 0) return path[0] ?? [-74, 40.7]
  if (t <= timestamps[0]) return path[0]
  if (t >= timestamps[timestamps.length - 1]) return path[path.length - 1]
  let i = 1
  while (i < timestamps.length && timestamps[i] < t) i++
  const t0 = timestamps[i - 1]
  const t1 = timestamps[i]
  const p0 = path[i - 1]
  const p1 = path[i]
  const r = (t - t0) / (t1 - t0)
  return [p0[0] + (p1[0] - p0[0]) * r, p0[1] + (p1[1] - p0[1]) * r]
}

function useFPS() {
  const [fps, setFps] = useState(0)
  const last = useRef(0)
  const frameCount = useRef(0)
  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      frameCount.current++
      if (now - last.current >= 1000) {
        setFps(frameCount.current)
        frameCount.current = 0
        last.current = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export default function MarkersDemo() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [time, setTime] = useState(0)
  const mapRef = useRef<MapRef | null>(null)
  const fps = useFPS()

  useEffect(() => {
    fetch('/api/trips')
      .then((r) => r.json())
      .then((data: Trip[]) => setTrips(data))
  }, [])

  // compute total duration across all trips for loop
  const maxTime = useMemo(
    () => trips.reduce((m, t) => Math.max(m, t.timestamps[t.timestamps.length - 1] ?? 0), 0),
    [trips]
  )

  useEffect(() => {
    let raf = 0
    const speed = 60 // seconds of data per second of wall time
    const start = performance.now()
    const loop = () => {
      const dt = (performance.now() - start) / 1000
      const t = (dt * speed) % (maxTime || 1)
      setTime(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [maxTime])

  return (
    <div style={{ height: 'calc(100vh - 57px)' }}>
      <Map ref={mapRef} mapStyle={MAP_STYLE} initialViewState={INITIAL_VIEW} mapboxAccessToken={MAPBOX_TOKEN}>
        <NavigationControl position='top-left' />
        {/* This is intentionally terrible for performance: thousands of controlled React components */}
        {trips.map((trip, idx) => {
          const pos = interpolatePosition(trip.path, trip.timestamps, time)
          const color = trip.vendor === 0 ? '#FFD60A' : '#2ECC71' // yellow/green
          return (
            <Marker key={idx} longitude={pos[0]} latitude={pos[1]}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: color,
                  boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                }}
                title={`vendor ${trip.vendor}`}
              />
            </Marker>
          )
        })}
      </Map>
      <div
        style={{
          position: 'absolute',
          top: 62,
          right: 12,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: 8,
          borderRadius: 6,
          fontFamily: 'monospace'
        }}
      >
        FPS: {fps}
      </div>
    </div>
  )
}
