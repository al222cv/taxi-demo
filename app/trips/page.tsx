'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { DeckGL } from '@deck.gl/react'
import { TripsLayer } from '@deck.gl/geo-layers'

type Trip = {
  vendor: number
  path: [number, number][]
  timestamps: number[]
}

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYWwyMjJjdiIsImEiOiJjbWdxdDE2YjgxcmJiMmxzYTF0NTd3dms2In0.tV0s1khLrqHzPDbOZUciNg'
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

const INITIAL_VIEW = {
  longitude: -74.0,
  latitude: 40.73,
  zoom: 11,
  pitch: 45,
  bearing: 0
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

export default function TripsDemo() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [time, setTime] = useState(0)
  const fps = useFPS()

  useEffect(() => {
    fetch('/api/trips')
      .then((r) => r.json())
      .then((data: Trip[]) => setTrips(data))
  }, [])

  const maxTime = useMemo(
    () => trips.reduce((m, t) => Math.max(m, t.timestamps[t.timestamps.length - 1] ?? 0), 0),
    [trips]
  )

  useEffect(() => {
    let raf = 0
    const speed = 60 // seconds per second
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

  const layers = [
    new TripsLayer<Trip>({
      id: 'trips',
      data: trips,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (d) => (d.vendor === 0 ? [255, 214, 10] : [46, 204, 113]),
      widthMinPixels: 2,
      capRounded: true,
      jointRounded: true,
      trailLength: 120, // seconds of trail
      currentTime: time,
      opacity: 0.9
    })
  ]

  return (
    <div style={{ height: 'calc(100vh - 57px)', position: 'relative' }}>
      <DeckGL initialViewState={INITIAL_VIEW} controller layers={layers}>
        <Map mapStyle={MAP_STYLE} mapboxAccessToken={MAPBOX_TOKEN} />
      </DeckGL>
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
        time: {time.toFixed(1)}s / {Math.round(maxTime)}s
      </div>
      <div
        style={{
          position: 'absolute',
          top: 100,
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
