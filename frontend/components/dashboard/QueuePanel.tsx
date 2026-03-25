'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { QueueMetric } from '@/lib/types'

interface QueueData {
  history: QueueMetric[]
  current: { depth: number; inFlight: number }
}

export default function QueuePanel() {
  const [data, setData] = useState<QueueData | null>(null)

  useEffect(() => {
    const fetch_ = async () => {
      const res = await fetch('/api/queue')
      setData(await res.json())
    }
    fetch_()
    const id = setInterval(fetch_, 5000)
    return () => clearInterval(id)
  }, [])

  if (!data?.current) return (
    <section className="bg-panel border border-border rounded-2xl p-5 animate-pulse h-64" />
  )

  return (
    <section className="bg-panel border border-border rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest font-mono">SQS Queue</h2>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-amber-400">{data.current.depth} visible</span>
          <span className="text-indigo-400">{data.current.inFlight} in-flight</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data.history} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="qDepth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="qFlight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e35" />
          <XAxis dataKey="timestamp" tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#12121f', border: '1px solid #1e1e35', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <Area type="monotone" dataKey="depth" name="Queue Depth" stroke="#f59e0b" strokeWidth={2} fill="url(#qDepth)" dot={false} />
          <Area type="monotone" dataKey="inFlight" name="In-Flight" stroke="#6366f1" strokeWidth={2} fill="url(#qFlight)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs font-mono text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block" />Queue Depth</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-400 inline-block" />In-Flight</span>
      </div>
    </section>
  )
}
