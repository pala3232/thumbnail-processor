'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Github, Layers, ChevronDown } from 'lucide-react'
import { useRealtimeData } from '@/lib/useRealtimeData'
import MetricsBar from '@/components/dashboard/MetricsBar'
import PodGrid from '@/components/dashboard/PodGrid'
import QueuePanel from '@/components/dashboard/QueuePanel'
import ThumbnailGallery from '@/components/dashboard/ThumbnailGallery'

// ── Animated title ─────────────────────────────────────────────────────────────

const titleVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.3 } },
}

const wordVariants = {
  hidden:  { opacity: 0, y: 24, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

function AnimatedTitle({ size = 'desktop' }: { size?: 'mobile' | 'desktop' }) {
  const h1Class = size === 'desktop'
    ? 'text-6xl font-bold tracking-tight leading-tight'
    : 'text-4xl font-bold tracking-tight leading-tight'

  return (
    <motion.h1 variants={titleVariants} initial="hidden" animate="visible" className={h1Class}>
      <motion.span variants={wordVariants} className="inline-block">Video</motion.span>
      {' '}
      <motion.span variants={wordVariants} className="inline-block">Thumbnail</motion.span>
      <br />
      <motion.span
        variants={wordVariants}
        className="inline-block bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient"
      >
        Pipeline
      </motion.span>
    </motion.h1>
  )
}

// Three.js — client only, no SSR
const PipelineScene = dynamic(() => import('@/components/scene/PipelineScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-surface" />,
})

// ── Live badge ─────────────────────────────────────────────────────────────────

function LiveBadge({ connected }: { connected: boolean | null }) {
  const isConnected = connected === true
  const isChecking  = connected === null

  const container = isConnected ? 'bg-emerald-400/10 border-emerald-400/30'
    : isChecking  ? 'bg-zinc-400/10 border-zinc-400/20'
    : 'bg-rose-400/10 border-rose-400/30'

  const dot = isConnected ? 'bg-emerald-400 animate-pulse'
    : isChecking  ? 'bg-zinc-500 animate-pulse'
    : 'bg-rose-400'

  const text = isConnected ? 'text-emerald-400' : isChecking ? 'text-zinc-500' : 'text-rose-400'
  const label = isConnected ? 'LIVE' : isChecking ? '...' : 'DOWN'

  return (
    <div className={`flex items-center gap-2 border rounded-full px-3 py-1 ${container}`}>
      <div className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`text-xs font-mono ${text}`}>{label}</span>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({ connected }: { connected: boolean }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers size={18} className="text-indigo-400" />
          <span className="font-semibold text-sm tracking-tight">thumbnail<span className="text-indigo-400">.</span>pipeline</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveBadge connected={connected} />
          <a
            href="https://github.com/pala3232/thumbnail-processor"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="GitHub"
          >
            <Github size={16} />
          </a>
        </div>
      </div>
    </header>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="overflow-hidden">
      {/* Mobile */}
      <div className="sm:hidden flex flex-col">
        <div className="relative h-[55vh] w-full">
          <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40 pointer-events-none" aria-hidden />
          <PipelineScene />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #0d0d1a 90%)' }} aria-hidden />
        </div>
        <div className="px-6 pt-6 pb-8 text-center flex flex-col items-center gap-4">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 border border-indigo-400/30 bg-indigo-400/10 rounded-full px-4 py-1.5">
            EKS Fargate · SQS · S3 · HPA
          </motion.div>
          <AnimatedTitle size="mobile" />
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
            className="text-sm text-zinc-400 font-mono animate-cursor">
            Event-driven · Auto-scaling · Serverless Fargate
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
            className="flex flex-col items-center gap-1 text-zinc-600" aria-hidden>
            <span className="text-xs font-mono">scroll</span>
            <ChevronDown size={14} className="animate-bounce" />
          </motion.div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex flex-col">
        <div className="relative h-[70vh] w-full">
          <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40 pointer-events-none" aria-hidden />
          <PipelineScene />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 40%, #0d0d1a 90%)' }} aria-hidden />
        </div>
        <div className="px-6 pt-8 pb-10 text-center flex flex-col items-center gap-4">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400 border border-indigo-400/30 bg-indigo-400/10 rounded-full px-4 py-1.5">
            EKS Fargate · SQS · S3 · HPA
          </motion.div>
          <AnimatedTitle size="desktop" />
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}
            className="text-sm text-zinc-400 max-w-md mx-auto font-mono animate-cursor">
            Event-driven · Auto-scaling · Serverless Fargate
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            className="flex flex-col items-center gap-1 text-zinc-600" aria-hidden>
            <span className="text-xs font-mono">scroll</span>
            <ChevronDown size={14} className="animate-bounce" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ── Home ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const { metrics, queue, pods, thumbnails, connected } = useRealtimeData()

  return (
    <div className="min-h-dvh bg-surface">
      <Header connected={connected} />
      <Hero />
      <div className="pt-10">
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-20 flex flex-col gap-10">
          <section>
            <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-4">Overview</h2>
            <MetricsBar metrics={metrics} />
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <PodGrid pods={pods} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest font-mono mb-4">Queue Activity</h2>
              <QueuePanel data={queue} />
            </div>
          </div>

          <ThumbnailGallery thumbs={thumbnails} />
        </main>
      </div>
    </div>
  )
}
