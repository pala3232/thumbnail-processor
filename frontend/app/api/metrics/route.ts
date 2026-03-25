import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  const res = await fetch(`${API}/api/metrics`, { next: { revalidate: 0 } })
  const d = await res.json()
  return NextResponse.json({
    totalProcessed:   d.totalThumbnails   ?? 0,
    successRate:      100,
    avgProcessingMs:  0,
    activePods:       d.runningPods       ?? 0,
    queueDepth:       d.queueDepth        ?? 0,
    inFlight:         d.inFlight          ?? 0,
    throughputPerHour: 0,
  })
}
