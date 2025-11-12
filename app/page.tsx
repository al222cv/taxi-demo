'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { AmbientLight, LightingEffect, _SunLight as SunLight } from '@deck.gl/core'
import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import { MapboxOverlay } from '@deck.gl/mapbox'

type Trip = {
  vendor: number
  path: [number, number][]
  timestamps: number[]
}

mapboxgl.accessToken = 'pk.eyJ1IjoiYWwyMjJjdiIsImEiOiJjbWdxdDE2YjgxcmJiMmxzYTF0NTd3dms2In0.tV0s1khLrqHzPDbOZUciNg'

const MAP_STYLE = 'mapbox://styles/mapbox/standard'

const INITIAL_VIEW = {
  center: [-74.01161982919646, 40.7063967446652] as [number, number],
  zoom: 15.572416855822532,
  pitch: 36.5,
  bearing: 30.4
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

function bearingDegrees(a: [number, number], b: [number, number]) {
  const [lon1, lat1] = a.map((v) => (v * Math.PI) / 180)
  const [lon2, lat2] = b.map((v) => (v * Math.PI) / 180)
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  const brng = Math.atan2(y, x)
  return ((brng * 180) / Math.PI + 360) % 360
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

export default function Taxis3D() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const deckOverlayRef = useRef<MapboxOverlay | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [time, setTime] = useState(0)
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom)
  const fps = useFPS()
  const [interleaved] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('deck-interleaved')
    return stored === 'true'
  })
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/trips')
      .then((r) => r.json())
      .then((data: Trip[]) => setTrips(data))
  }, [])

  const maxTime = useMemo(
    () => trips.reduce((m, t) => Math.max(m, t.timestamps[t.timestamps.length - 1] ?? 0), 0),
    [trips]
  )

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      ...INITIAL_VIEW,
      antialias: true,
      config: {
        basemap: {
          // lightPreset: '',
          showPlaceLabels: false,
          showPointOfInterestLabels: false,
          showTransitLabels: false,
          showRoadLabels: false
        }
      }
    })

    mapRef.current = map

    map.on('load', () => {
      setMapLoaded(true)
    })

    map.on('zoom', () => {
      setZoom(map.getZoom())
    })

    map.on('moveend', () => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      const pitch = map.getPitch()
      const bearing = map.getBearing()
      console.log('Camera position:', {
        center: [center.lng, center.lat],
        zoom,
        pitch,
        bearing
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Create/recreate deck.gl overlay when interleaved changes or map loads
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Remove old overlay if exists
    if (deckOverlayRef.current) {
      map.removeControl(deckOverlayRef.current as unknown as mapboxgl.IControl)
      deckOverlayRef.current = null
    }

    // Create new overlay with current interleaved setting
    const deckOverlay = new MapboxOverlay({
      interleaved,
      layers: []
    })

    deckOverlayRef.current = deckOverlay
    map.addControl(deckOverlay as unknown as mapboxgl.IControl)
  }, [interleaved, mapLoaded])

  useEffect(() => {
    let raf = 0
    const speed = 50
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

  // Update deck.gl layers when data/time changes
  useEffect(() => {
    if (!deckOverlayRef.current) return

    const ambientLight = new AmbientLight({ color: [255, 255, 255], intensity: 2.0 })
    const sunLight = new SunLight({ timestamp: Date.UTC(2020, 6, 1, 12), color: [255, 255, 255], intensity: 1.8 })
    const lightingEffect = new LightingEffect({ ambientLight, sunLight })

    const layers = [
      new ScenegraphLayer<Trip>({
        id: 'taxis-3d',
        data: trips,
        scenegraph: '/taxi.glb',
        sizeScale: zoom > 14 ? 10 : 40,

        getPosition: (d: Trip) => interpolatePosition(d.path, d.timestamps, time),
        getOrientation: (d: Trip) => {
          const p = interpolatePosition(d.path, d.timestamps, time)
          const p2 = interpolatePosition(
            d.path,
            d.timestamps,
            Math.min(time + 1, d.timestamps[d.timestamps.length - 1])
          )
          const brng = bearingDegrees(p, p2)
          return [0, -brng + 90, 90]
        },
        getColor: (d: Trip) => (d.vendor === 0 ? [255, 255, 0] : [0, 255, 128]),
        _lighting: 'flat',
        pickable: false,
        updateTriggers: {
          getPosition: [time],
          getOrientation: [time]
        }
      })
    ]

    deckOverlayRef.current.setProps({
      layers,
      effects: [lightingEffect]
    })
  }, [trips, time, zoom])

  return (
    <div style={{ height: 'calc(100vh - 57px)', position: 'relative' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
        time: {time.toFixed(1)}s
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

      <div
        style={{
          position: 'absolute',
          top: 138,
          right: 12,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: 8,
          borderRadius: 6,
          fontFamily: 'monospace'
        }}
      >
        zoom: {zoom.toFixed(1)}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 176,
          right: 12,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          padding: 8,
          borderRadius: 6,
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <input
          type='checkbox'
          checked={interleaved}
          onChange={(e) => {
            localStorage.setItem('deck-interleaved', String(e.target.checked))
            window.location.reload()
          }}
          style={{ cursor: 'pointer' }}
        />
        <label
          style={{ cursor: 'pointer' }}
          onClick={() => {
            localStorage.setItem('deck-interleaved', String(!interleaved))
            window.location.reload()
          }}
        >
          interleaved
        </label>
      </div>
    </div>
  )
}
