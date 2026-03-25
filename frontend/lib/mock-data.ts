import type { Pod, QueueMetric, Thumbnail, PipelineMetrics } from './types'

const now = Date.now()

export const mockPods: Pod[] = [
  { id: 'pod-a1b2', name: 'thumbnail-worker-a1b2', namespace: 'thumbnail', status: 'Running', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 60 * 4).toISOString(), jobId: 'job-001', node: 'fargate-ap-southeast-2a' },
  { id: 'pod-c3d4', name: 'thumbnail-worker-c3d4', namespace: 'thumbnail', status: 'Running', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 60 * 2).toISOString(), jobId: 'job-002', node: 'fargate-ap-southeast-2b' },
  { id: 'pod-e5f6', name: 'thumbnail-worker-e5f6', namespace: 'thumbnail', status: 'Running', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 45).toISOString(), jobId: 'job-003', node: 'fargate-ap-southeast-2a' },
  { id: 'pod-g7h8', name: 'thumbnail-worker-g7h8', namespace: 'thumbnail', status: 'Pending', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 10).toISOString(), jobId: 'job-004', node: 'fargate-ap-southeast-2c' },
  { id: 'pod-i9j0', name: 'thumbnail-worker-i9j0', namespace: 'thumbnail', status: 'Succeeded', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 60 * 8).toISOString(), jobId: 'job-000', node: 'fargate-ap-southeast-2b' },
  { id: 'pod-k1l2', name: 'thumbnail-worker-k1l2', namespace: 'thumbnail', status: 'Failed', cpuRequest: '2', memRequest: '4Gi', startedAt: new Date(now - 1000 * 60 * 15).toISOString(), jobId: 'job-099', node: 'fargate-ap-southeast-2a' },
]

export function generateQueueHistory(): QueueMetric[] {
  const points: QueueMetric[] = []
  for (let i = 29; i >= 0; i--) {
    const t = new Date(now - i * 60 * 1000)
    const depth = Math.max(0, Math.floor(8 - i * 0.2 + Math.sin(i * 0.5) * 3 + Math.random() * 2))
    points.push({
      timestamp: t.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
      depth,
      inFlight: Math.min(depth, Math.floor(Math.random() * 4)),
      processed: Math.floor(Math.random() * 5 + 2),
    })
  }
  return points
}

const VIDEO_NAMES = ['product-demo.mp4', 'onboarding-tour.mp4', 'keynote-2024.mp4', 'explainer-v2.mp4', 'testimonial-jane.mp4', 'launch-event.mp4']
const FRAMES: Array<'0%' | '50%' | '100%'> = ['0%', '50%', '100%']

export const mockThumbnails: Thumbnail[] = VIDEO_NAMES.flatMap((video, vi) =>
  FRAMES.map((frame, fi) => ({
    id: `thumb-${vi}-${fi}`,
    jobId: `job-00${vi}`,
    videoKey: `uploads/${video}`,
    s3Key: `thumbnails/${video.replace('.mp4', '')}_${fi + 1}.jpg`,
    url: `https://picsum.photos/seed/${vi * 3 + fi}/320/180`,
    frame,
    generatedAt: new Date(now - (VIDEO_NAMES.length - vi) * 60 * 1000 * 3).toISOString(),
    processingTimeMs: 2800 + Math.floor(Math.random() * 1400),
  }))
)

export const mockMetrics: PipelineMetrics = {
  totalProcessed: 1247,
  successRate: 98.2,
  avgProcessingMs: 3420,
  activePods: 3,
  queueDepth: 5,
  inFlight: 3,
  throughputPerHour: 84,
}
