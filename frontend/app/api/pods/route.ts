import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  const res = await fetch(`${API}/api/pods`, { next: { revalidate: 0 } })
  const data = await res.json()
  return NextResponse.json(
    data.map((p: { name: string; status: string; startedAt: string | null; node: string | null }) => ({
      id:         p.name,
      name:       p.name,
      namespace:  'thumbnail',
      status:     p.status,
      cpuRequest: '500m',
      memRequest: '512Mi',
      startedAt:  p.startedAt ?? new Date().toISOString(),
      jobId:      '',
      node:       p.node ?? '',
    }))
  )
}
