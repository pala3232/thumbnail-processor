import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/health`, { next: { revalidate: 0 } })
    if (!res.ok) return NextResponse.json({ status: 'down' }, { status: 502 })
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'down' }, { status: 502 })
  }
}
