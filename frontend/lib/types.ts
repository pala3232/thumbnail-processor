export type PodStatus = 'Running' | 'Pending' | 'Succeeded' | 'Failed'

export interface Pod {
  id: string
  name: string
  namespace: string
  status: PodStatus
  cpuRequest: string
  memRequest: string
  startedAt: string
  jobId: string
  node: string
}

export interface QueueMetric {
  timestamp: string
  depth: number
  inFlight: number
  processed: number
}

export interface Thumbnail {
  id: string
  jobId: string
  videoKey: string
  s3Key: string
  url: string
  frame: '0%' | '50%' | '100%'
  generatedAt: string
  processingTimeMs: number
}

export interface PipelineMetrics {
  totalProcessed: number
  successRate: number
  avgProcessingMs: number
  activePods: number
  queueDepth: number
  inFlight: number
  throughputPerHour: number
}
