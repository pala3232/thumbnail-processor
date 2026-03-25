'use client'

import { motion } from 'framer-motion'
import { CheckCircle, Layers, BarChart2, Activity, Database, Server } from 'lucide-react'
import type { BackendMetrics } from '@/lib/useRealtimeData'

function MetricCard({ icon: Icon, label, value, unit, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  unit?: string
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 min-w-[140px] bg-panel border border-border rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-xs text-zinc-500 uppercase tracking-widest font-mono">{label}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className={`text-2xl font-bold font-mono ${color}`}>{value}</span>
        {unit && <span className="text-xs text-zinc-500 mb-1">{unit}</span>}
      </div>
    </motion.div>
  )
}

function SkeletonCard() {
  return <div className="flex-1 min-w-[140px] h-20 bg-panel border border-border rounded-xl animate-pulse" />
}

export default function MetricsBar({ metrics }: { metrics: BackendMetrics | null }) {
  if (!metrics) return (
    <div className="flex gap-3">
      {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )

  const storageMB = (metrics.storageBytes / 1024 / 1024).toFixed(1)

  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard icon={CheckCircle} label="Processed"    value={metrics.totalThumbnails}          color="text-emerald-400" />
      <MetricCard icon={Layers}      label="Running Pods" value={metrics.runningPods}               color="text-indigo-400" />
      <MetricCard icon={Server}      label="Total Pods"   value={metrics.totalPods}                 color="text-indigo-300" />
      <MetricCard icon={BarChart2}   label="Queue Depth"  value={metrics.queueDepth}                color="text-amber-400" />
      <MetricCard icon={Activity}    label="In-Flight"    value={metrics.inFlight}                  color="text-cyan-400" />
      <MetricCard icon={Database}    label="Storage"      value={storageMB} unit="MB"               color="text-violet-400" />
    </div>
  )
}
