import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  const res = await fetch(`${API}/api/queue`, { next: { revalidate: 0 } })
  const d = await res.json()
  return NextResponse.json({
    current: { depth: d.depth, inFlight: d.inFlight },
    history: (d.history ?? []).map((p: { time: string; depth: number }) => ({
      timestamp: p.time,
      depth:     p.depth,
      inFlight:  0,
      processed: 0,
    })),
  })
}
