'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, CheckCircle, Clock, Layers, BarChart2, Zap } from 'lucide-react'
import type { PipelineMetrics } from '@/lib/types'

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

export default function MetricsBar() {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null)

  useEffect(() => {
    const fetch_ = async () => {
      const res = await fetch('/api/metrics')
      setMetrics(await res.json())
    }
    fetch_()
    const id = setInterval(fetch_, 5000)
    return () => clearInterval(id)
  }, [])

  if (!metrics || metrics.totalProcessed === undefined) return (
    <div className="flex gap-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 min-w-[140px] h-20 bg-panel border border-border rounded-xl" />
      ))}
    </div>
  )

  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard icon={CheckCircle} label="Processed" value={metrics.totalProcessed.toLocaleString()} color="text-emerald-400" />
      <MetricCard icon={Activity} label="Success Rate" value={metrics.successRate} unit="%" color="text-emerald-400" />
      <MetricCard icon={Clock} label="Avg Time" value={(metrics.avgProcessingMs / 1000).toFixed(1)} unit="s" color="text-cyan-400" />
      <MetricCard icon={Layers} label="Active Pods" value={metrics.activePods} color="text-indigo-400" />
      <MetricCard icon={BarChart2} label="Queue Depth" value={metrics.queueDepth} color="text-amber-400" />
      <MetricCard icon={Zap} label="Throughput" value={metrics.throughputPerHour} unit="/hr" color="text-violet-400" />
    </div>
  )
}
