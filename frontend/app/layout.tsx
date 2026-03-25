import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Thumbnail Pipeline — Dashboard',
  description: 'Real-time EKS Fargate video thumbnail pipeline dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
