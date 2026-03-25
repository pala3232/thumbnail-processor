'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ImageIcon, Clock } from 'lucide-react'
import type { Thumbnail } from '@/lib/types'

const FRAME_COLOR: Record<string, string> = {
  '0%':   'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
  '50%':  'text-indigo-400 border-indigo-400/30 bg-indigo-400/10',
  '100%': 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
}

function ThumbnailCard({ thumb, index }: { thumb: Thumbnail; index: number }) {
  const frameStyle = FRAME_COLOR[thumb.frame]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="bg-panel border border-border rounded-xl overflow-hidden group hover:border-indigo-500/40 transition-colors"
    >
      <div className="relative aspect-video overflow-hidden bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb.url}
          alt={`Thumbnail ${thumb.frame} of ${thumb.videoKey}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className={`absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded border ${frameStyle}`}>
          {thumb.frame}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-xs font-mono text-zinc-300 truncate">{thumb.videoKey.replace('uploads/', '')}</p>
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock size={9} />
            {(thumb.processingTimeMs / 1000).toFixed(1)}s
          </span>
          <span>{thumb.jobId}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function ThumbnailGallery() {
  const [thumbs, setThumbs] = useState<Thumbnail[]>([])
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/thumbnails').then(r => r.json()).then(setThumbs)
  }, [])

  const filtered = filter === 'all' ? thumbs : thumbs.filter(t => t.frame === filter)

  return (
    <section>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest font-mono">Generated Thumbnails</h2>
          <span className="text-xs font-mono text-zinc-500">{filtered.length}</span>
        </div>
        <div className="flex gap-1">
          {['all', '0%', '50%', '100%'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-mono px-3 py-1 rounded-lg border transition-colors cursor-pointer ${
                filter === f
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {f === 'all' ? 'All' : `Frame ${f}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {filtered.map((t, i) => <ThumbnailCard key={t.id} thumb={t} index={i} />)}
      </div>
    </section>
  )
}
