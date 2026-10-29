import { useEffect, useRef, useState } from 'react'
import './ApplicationMap.css'

type Leaflet = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => any
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: any) => unknown }
  marker: (coordinates: [number, number]) => { addTo: (map: any) => { bindPopup: (content: string) => { openPopup: () => unknown } } }
}

declare global {
  interface Window {
    L?: Leaflet
    __leafletPromise?: Promise<Leaflet>
  }
}

const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN?.trim()

function loadLeaflet(): Promise<Leaflet> {
  if (window.L) return Promise.resolve(window.L)
  if (window.__leafletPromise) return window.__leafletPromise

  window.__leafletPromise = new Promise((resolve, reject) => {
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    stylesheet.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
    stylesheet.crossOrigin = 'anonymous'
    document.head.append(stylesheet)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
    script.crossOrigin = 'anonymous'
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet no quedó disponible.'))
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet. Revisá la conexión.'))
    document.head.append(script)
  }).catch((error) => {
    window.__leafletPromise = undefined
    throw error
  })
  return window.__leafletPromise
}

export default function ApplicationMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!host.current) return
    if (!mapboxToken) {
      setError('Falta configurar el token público de mapas para mostrar esta ubicación.')
      return
    }

    let map: any
    let cancelled = false
    setError('')

    void loadLeaflet().then((L) => {
      if (cancelled || !host.current) return
      map = L.map(host.current, { scrollWheelZoom: false, zoomControl: true }).setView([latitude, longitude], 17)
      L.tileLayer(
        'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=' + encodeURIComponent(mapboxToken),
        {
          tileSize: 512,
          zoomOffset: -1,
          maxZoom: 20,
          attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      ).addTo(map)
      L.marker([latitude, longitude]).addTo(map).bindPopup('Domicilio declarado').openPopup()
      window.setTimeout(() => map?.invalidateSize(), 0)
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el mapa.')
    })

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [latitude, longitude])

  return (
    <div className="application-map-wrap">
      {error ? <p className="application-map-error" role="status">{error}</p> : <div className="application-map" ref={host} aria-label="Mapa del domicilio declarado" />}
    </div>
  )
}
