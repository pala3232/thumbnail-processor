import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/api/queue`, { next: { revalidate: 0 } })
    const d = await res.json()
    return NextResponse.json({
      current: { depth: d.depth ?? 0, inFlight: d.inFlight ?? 0 },
      history: (d.history ?? []).map((p: { time: string; depth: number }) => ({
        timestamp: p.time,
        depth:     p.depth,
        inFlight:  0,
        processed: 0,
      })),
    })
  } catch {
    return NextResponse.json({ current: { depth: 0, inFlight: 0 }, history: [] })
  }
}
