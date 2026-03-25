import { useEffect, useRef, useState } from 'react'

export interface BackendMetrics {
  queueDepth:      number
  inFlight:        number
  totalThumbnails: number
  storageBytes:    number
  runningPods:     number
  totalPods:       number
}

export interface BackendQueue {
  depth:    number
  inFlight: number
  history:  { time: string; depth: number }[]
}

export interface BackendPod {
  name:      string
  status:    string
  ready:     boolean
  restarts:  number
  startedAt: string | null
  node:      string | null
}

export interface BackendThumbnail {
  key:          string
  url:          string
  frame:        string
  lastModified: string
  size:         number
}

export interface RealtimeData {
  metrics:    BackendMetrics | null
  queue:      BackendQueue   | null
  pods:       BackendPod[]
  thumbnails: BackendThumbnail[]
  connected:  boolean
}

export function useRealtimeData(): RealtimeData {
  const [data, setData] = useState<RealtimeData>({
    metrics:    null,
    queue:      null,
    pods:       [],
    thumbnails: [],
    connected:  false,
  })

  const delay  = useRef(1000)
  const timer  = useRef<ReturnType<typeof setTimeout>>()
  const socket = useRef<WebSocket>()

  useEffect(() => {
    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws    = new WebSocket(`${proto}//${window.location.host}/ws`)
      socket.current = ws

      ws.onopen = () => {
        delay.current = 1000
        setData(prev => ({ ...prev, connected: true }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          setData(prev => ({
            ...prev,
            metrics:    msg.metrics    ?? prev.metrics,
            queue:      msg.queue      ?? prev.queue,
            pods:       msg.pods       ?? prev.pods,
            thumbnails: msg.thumbnails ?? prev.thumbnails,
          }))
        } catch { /* ignore malformed frames */ }
      }

      ws.onclose = () => {
        setData(prev => ({ ...prev, connected: false }))
        timer.current = setTimeout(() => {
          delay.current = Math.min(delay.current * 2, 30000)
          connect()
        }, delay.current)
      }

      ws.onerror = () => ws.close()
    }

    // Ping every 30s to keep the ALB connection alive (default idle timeout = 60s)
    const ping = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send('ping')
      }
    }, 30000)

    connect()

    return () => {
      clearInterval(ping)
      clearTimeout(timer.current)
      socket.current?.close()
    }
  }, [])

  return data
}
