'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Github, Layers, ChevronDown, FlaskConical, Trash2 } from 'lucide-react'
import { useState } from 'react'
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

// ── Test button ────────────────────────────────────────────────────────────────

type TestState = 'idle' | 'loading' | 'success' | 'error'

function TestButton() {
  const [state, setState] = useState<TestState>('idle')
  const [result, setResult] = useState<string>('')

  const run = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setResult(data.detail ?? data.error ?? 'Error')
        setState('error')
      } else {
        setResult(`${data.queued} video${data.queued !== 1 ? 's' : ''} queued`)
        setState('success')
      }
    } catch {
      setResult('Could not reach API')
      setState('error')
    }
    setTimeout(() => setState('idle'), 4000)
  }

  const styles: Record<TestState, string> = {
    idle:    'border-zinc-700 text-zinc-400 hover:border-indigo-500/60 hover:text-indigo-400',
    loading: 'border-zinc-700 text-zinc-500 cursor-not-allowed',
    success: 'border-emerald-500/40 text-emerald-400',
    error:   'border-rose-500/40 text-rose-400',
  }

  return (
    <button
      onClick={run}
      disabled={state === 'loading'}
      className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${styles[state]}`}
    >
      <FlaskConical size={12} />
      {state === 'idle'    && 'Test Pipeline'}
      {state === 'loading' && 'Queueing...'}
      {state === 'success' && result}
      {state === 'error'   && result}
    </button>
  )
}

// ── Purge button ───────────────────────────────────────────────────────────────

type PurgeState = 'idle' | 'loading' | 'success' | 'error'

function PurgeButton() {
  const [state, setState] = useState<PurgeState>('idle')
  const [result, setResult] = useState<string>('')

  const run = async () => {
    setState('loading')
    try {
      const res = await fetch('/api/purge', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setResult(data.detail ?? data.error ?? 'Error')
        setState('error')
      } else {
        setResult(`${data.deleted} object${data.deleted !== 1 ? 's' : ''} deleted`)
        setState('success')
      }
    } catch {
      setResult('Could not reach API')
      setState('error')
    }
    setTimeout(() => setState('idle'), 4000)
  }

  const styles: Record<PurgeState, string> = {
    idle:    'border-zinc-700 text-zinc-400 hover:border-rose-500/60 hover:text-rose-400',
    loading: 'border-zinc-700 text-zinc-500 cursor-not-allowed',
    success: 'border-rose-500/40 text-rose-400',
    error:   'border-rose-500/40 text-rose-400',
  }

  return (
    <button
      onClick={run}
      disabled={state === 'loading'}
      className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${styles[state]}`}
    >
      <Trash2 size={12} />
      {state === 'idle'    && 'Purge'}
      {state === 'loading' && 'Purging...'}
      {state === 'success' && result}
      {state === 'error'   && result}
    </button>
  )
}

// ── Live badge ─────────────────────────────────────────────────────────────────

function LiveBadge({ connected }: { connected: boolean | null }) {
  const isConnected = connected === true
  const isChecking  = connected === null

  const container = isConnected ? 'bg-emerald-500/20 border-emerald-500/50'
    : isChecking  ? 'bg-zinc-700/40 border-zinc-600/50'
    : 'bg-rose-500/20 border-rose-500/50'

  const dot = isConnected ? 'bg-emerald-400 animate-pulse'
    : isChecking  ? 'bg-zinc-400 animate-pulse'
    : 'bg-rose-500'

  const text = isConnected ? 'text-emerald-400' : isChecking ? 'text-zinc-400' : 'text-rose-400'
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

// ── Description ────────────────────────────────────────────────────────────────

function Description() {
  const [open, setOpen] = useState(false)
  return (
    <section className="max-w-2xl mx-auto text-center flex flex-col items-center gap-4 px-4 pb-4">
      <p className="text-sm text-zinc-400 font-mono leading-relaxed">
        This project is an event-driven video thumbnail pipeline running entirely on AWS.
        Upload any video and three thumbnails are automatically extracted. No servers to manage,
        scales to zero when idle, and back up the moment work arrives.
      </p>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs font-mono text-indigo-400 border border-indigo-400/30 rounded-full px-4 py-1.5 hover:bg-indigo-400/10 transition-colors"
      >
        {open ? 'Hide' : 'How I built it →'}
      </button>
      {open && (
        <motion.ul
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-zinc-500 font-mono leading-relaxed text-left flex flex-col gap-3 w-full"
        >
          <li><span className="text-zinc-300">Event trigger.</span> Videos uploaded to S3 fire an event notification to SQS, one message per file across 10 supported formats.</li>
          <li><span className="text-zinc-300">Worker.</span> A KEDA-scaled pod on EKS Fargate picks up the message, downloads the video, extracts three frames at 10%, 50%, and 95% using ffmpeg, and uploads the thumbnails back to S3.</li>
          <li><span className="text-zinc-300">Autoscaling.</span> The worker scales from zero to one pod per message. Cold starts are the main Fargate tradeoff, kept short with a 15s KEDA polling interval.</li>
          <li><span className="text-zinc-300">Real-time dashboard.</span> The frontend connects via WebSocket to a FastAPI service broadcasting live state every 5 seconds: pod status from the Kubernetes API, queue depth in-memory at 5s resolution, and thumbnails via presigned S3 URLs.</li>
          <li><span className="text-zinc-300">Infrastructure.</span> Fully defined in Terraform across separate modules for networking, EKS, IAM, SQS, S3, and DNS, with GitHub Actions workflows for build, deploy, and teardown.</li>
        </motion.ul>
      )}
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
      <Description />
      <div className="pt-10">
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-20 flex flex-col gap-10">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Overview</h2>
              <div className="flex items-center gap-2">
                <PurgeButton />
                <TestButton />
              </div>
            </div>
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
