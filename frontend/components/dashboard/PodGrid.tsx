'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Server, Clock, RefreshCw } from 'lucide-react'
import type { BackendPod } from '@/lib/useRealtimeData'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  Running:   { label: 'Running',   dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  Pending:   { label: 'Pending',   dot: 'bg-amber-400 animate-pulse',   text: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20' },
  Succeeded: { label: 'Succeeded', dot: 'bg-zinc-500',                  text: 'text-zinc-400',    bg: 'bg-zinc-800/50 border-zinc-700/30' },
  Failed:    { label: 'Failed',    dot: 'bg-rose-400',                  text: 'text-rose-400',    bg: 'bg-rose-400/10 border-rose-400/20' },
}
const FALLBACK_STATUS = { label: 'Unknown', dot: 'bg-zinc-500', text: 'text-zinc-400', bg: 'bg-zinc-800/50 border-zinc-700/30' }

function elapsed(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function PodCard({ pod }: { pod: BackendPod }) {
  const cfg = STATUS_CONFIG[pod.status] ?? FALLBACK_STATUS
  const [age, setAge] = useState(() => pod.startedAt ? elapsed(pod.startedAt) : '—')

  useEffect(() => {
    if (!pod.startedAt) return
    const id = setInterval(() => setAge(elapsed(pod.startedAt!)), 1000)
    return () => clearInterval(id)
  }, [pod.startedAt])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className={`border rounded-xl p-4 flex flex-col gap-3 ${cfg.bg}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Server size={14} className={`${cfg.text} shrink-0`} />
          <span className="text-xs font-mono text-zinc-300 truncate" title={pod.name}>{pod.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-mono ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono">
        <div className="text-zinc-500">Ready</div>
        <div className={pod.ready ? 'text-emerald-400' : 'text-rose-400'}>{pod.ready ? 'Yes' : 'No'}</div>
        <div className="text-zinc-500">Restarts</div>
        <div className={`${pod.restarts > 0 ? 'text-amber-400' : 'text-zinc-300'}`}>{pod.restarts}</div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono border-t border-white/5 pt-2">
        <Clock size={11} />
        <span>{age}</span>
        <span className="ml-auto truncate text-right max-w-[140px]" title={pod.node ?? ''}>{pod.node ?? '—'}</span>
      </div>
    </motion.div>
  )
}

export default function PodGrid({ pods }: { pods: BackendPod[] }) {
  const running = pods.filter(p => p.status === 'Running').length

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest font-mono">Fargate Pods</h2>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
          <RefreshCw size={10} className="text-emerald-400" />
          <span>{running}/{pods.length} running</span>
        </div>
      </div>
      <AnimatePresence mode="popLayout">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {pods.map(pod => <PodCard key={pod.name} pod={pod} />)}
        </div>
      </AnimatePresence>
    </section>
  )
}
