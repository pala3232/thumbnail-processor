import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const API = process.env.API_BASE_URL ?? 'http://thumbnail-api:8000'

export async function GET() {
  try {
    const res = await fetch(`${API}/api/thumbnails`, { next: { revalidate: 0 } })
    const data = await res.json()
    return NextResponse.json(
      (Array.isArray(data) ? data : []).map((t: { key: string; url: string; frame: string; lastModified: string }, i: number) => ({
        id:               `${i}-${t.key}`,
        s3Key:            t.key,
        videoKey:         'uploads/' + t.key.replace(/^thumbnails\//, '').replace(/_[123]\.jpg$/, '.mp4'),
        url:              t.url,
        frame:            t.frame,
        generatedAt:      t.lastModified,
        processingTimeMs: 0,
        jobId:            '',
      }))
    )
  } catch {
    return NextResponse.json([])
  }
}
