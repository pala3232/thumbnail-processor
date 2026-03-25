import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function POST() {
  try {
    const res = await fetch(`${API}/api/test`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to reach API' }, { status: 502 })
  }
}
