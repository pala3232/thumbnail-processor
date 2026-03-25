'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { BackendQueue } from '@/lib/useRealtimeData'

export default function QueuePanel({ data }: { data: BackendQueue | null }) {
  if (!data) return (
    <section className="bg-panel border border-border rounded-2xl p-5 animate-pulse h-64" />
  )

  return (
    <section className="bg-panel border border-border rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest font-mono">SQS Queue</h2>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-amber-400">{data.depth} visible</span>
          <span className="text-indigo-400">{data.inFlight} in-flight</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data.history} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="qDepth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e35" />
          <XAxis dataKey="time" tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} interval={11} />
          <YAxis tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#12121f', border: '1px solid #1e1e35', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <Area type="monotone" dataKey="depth" name="Queue Depth" stroke="#f59e0b" strokeWidth={2} fill="url(#qDepth)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex gap-4 text-xs font-mono text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block" />Queue Depth</span>
      </div>
    </section>
  )
}
