'use client'

import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Float, Text, Torus, Line, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

// ── Node types ───────────────────────────────────────────────────────────────

type Variant = 'card' | 'coin' | 'cube' | 'hex'

interface NodeProps {
  position: [number, number, number]
  color: string
  label: string
  icon: string
  scale?: number
  variant?: Variant
}

// All shape variants in one component — hooks always called unconditionally
function ServiceMesh({ meshRef, color, scale, icon, variant }: {
  meshRef: React.Ref<THREE.Mesh>
  color: string
  scale: number
  icon: string
  variant: Variant
}) {
  const texture = useTexture(icon)
  texture.colorSpace = THREE.SRGBColorSpace

  const iconMat = useMemo(() => new THREE.MeshBasicMaterial({ map: texture }), [texture])
  const rimMat  = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.1, metalness: 1 }), [color])

  // card: icon only on front+back, glowing rim on sides
  const cardMats = useMemo(() => [rimMat, rimMat, rimMat, rimMat, iconMat, iconMat], [iconMat, rimMat])
  // coin: icon only on caps, glowing rim on side
  const coinMats = useMemo(() => [rimMat, iconMat, iconMat], [iconMat, rimMat])
  // cube: icon on all 6 faces so every rotation shows the icon
  const cubeAllMats = useMemo(() => [iconMat, iconMat, iconMat, iconMat, iconMat, iconMat], [iconMat])
  // hex: icon on caps only, glowing rim on sides — prism is laid on its side so cap faces camera
  const hexMats = useMemo(() => [rimMat, iconMat, iconMat], [iconMat, rimMat])

  if (variant === 'card') return (
    <mesh ref={meshRef} material={cardMats}>
      <boxGeometry args={[0.85 * scale, 0.85 * scale, 0.07 * scale]} />
    </mesh>
  )
  if (variant === 'coin') return (
    <mesh ref={meshRef} material={coinMats}>
      <cylinderGeometry args={[0.44 * scale, 0.44 * scale, 0.14 * scale, 32]} />
    </mesh>
  )
  if (variant === 'cube') return (
    <mesh ref={meshRef} material={cubeAllMats}>
      <boxGeometry args={[0.65 * scale, 0.65 * scale, 0.65 * scale]} />
    </mesh>
  )
  // hex prism
  return (
    <mesh ref={meshRef} material={hexMats} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.44 * scale, 0.44 * scale, 0.6 * scale, 6]} />
    </mesh>
  )
}

function PipelineNode({ position, color, label, icon, scale = 1.2, variant = 'card' }: NodeProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += delta * 0.3
    if (variant === 'cube')  meshRef.current.rotation.x += delta * 0.12
    if (variant === 'coin') meshRef.current.rotation.x += delta * 0.18
  })

  const fallbackArgs: [number, number, number] = [0.7 * scale, 0.7 * scale, 0.07 * scale]

  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.5}>
      <group position={position}>
        <Suspense fallback={
          <mesh ref={meshRef}>
            <boxGeometry args={fallbackArgs} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
          </mesh>
        }>
          <ServiceMesh meshRef={meshRef} color={color} scale={scale} icon={icon} variant={variant} />
        </Suspense>
        {/* Glow ring */}
        <Torus args={[0.6 * scale, 0.02, 8, 64]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} transparent opacity={0.4} />
        </Torus>
        <Text
          position={[0, -0.72 * scale, 0]}
          fontSize={0.18}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      </group>
    </Float>
  )
}

// ── Animated particles flowing along a path ──────────────────────────────────

interface ParticleFlowProps {
  from: [number, number, number]
  to: [number, number, number]
  color: string
  count?: number
  speed?: number
}

function ParticleFlow({ from, to, color, count = 5, speed = 0.6 }: ParticleFlowProps) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const offsets = useMemo(() => Array.from({ length: count }, (_, i) => i / count), [count])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const progress = ((t * speed + offsets[i]) % 1)
      mesh.position.set(
        THREE.MathUtils.lerp(from[0], to[0], progress),
        THREE.MathUtils.lerp(from[1], to[1], progress),
        THREE.MathUtils.lerp(from[2], to[2], progress),
      )
      mesh.scale.setScalar(0.5 + Math.sin(progress * Math.PI) * 0.5)
    })
  })

  return (
    <>
      {offsets.map((_, i) => (
        <mesh key={i} ref={el => { refs.current[i] = el }}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
        </mesh>
      ))}
    </>
  )
}

// ── Connection lines ──────────────────────────────────────────────────────────

function ConnectionLine({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const points = useMemo(() => [new THREE.Vector3(...from), new THREE.Vector3(...to)], [from, to])
  return <Line points={points} color={color} lineWidth={1} opacity={0.3} transparent dashed dashScale={5} />
}

// ── Starfield background ──────────────────────────────────────────────────────

function Stars() {
  const ref = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(2000 * 3)
    for (let i = 0; i < 2000; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 60
      arr[i * 3 + 1] = (Math.random() - 0.5) * 60
      arr[i * 3 + 2] = (Math.random() - 0.5) * 60
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.01
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#6366f1" size={0.05} transparent opacity={0.6} />
    </points>
  )
}

// ── Grid floor ────────────────────────────────────────────────────────────────

function GridFloor() {
  return (
    <gridHelper args={[20, 20, '#1e1e35', '#1e1e35']} position={[0, -4, 0]} />
  )
}

// ── Scene ─────────────────────────────────────────────────────────────────────

const NODES: Array<NodeProps & { id: string }> = [
  { id: 'upload', position: [-3, 0, 0],      color: '#06b6d4', label: 'S3 Upload',   scale: 1.2, icon: '/icons/s3.png',  variant: 'card' },
  { id: 'sqs',    position: [-1, 0.6, 0],    color: '#f59e0b', label: 'SQS Queue',  scale: 1.2, icon: '/icons/sqs.png', variant: 'coin' },
  { id: 'eks',    position: [1, 0, 0],       color: '#6366f1', label: 'EKS Fargate', scale: 1.5, icon: '/icons/eks.png', variant: 'cube' },
  { id: 's3out',  position: [3, 0.6, 0],     color: '#10b981', label: 'S3 Output',  scale: 1.2, icon: '/icons/s3.png',  variant: 'card' },
  { id: 'ecr',    position: [1, 2.2, -0.5],  color: '#f43f5e', label: 'ECR',        scale: 1.0, icon: '/icons/ecr.png', variant: 'cube' },
]

const EDGES: Array<{ from: [number, number, number]; to: [number, number, number]; color: string }> = [
  { from: [-3, 0, 0], to: [-1, 0.6, 0], color: '#06b6d4' },
  { from: [-1, 0.6, 0], to: [1, 0, 0], color: '#f59e0b' },
  { from: [1, 0, 0], to: [3, 0.6, 0], color: '#10b981' },
  { from: [1, 2.2, -0.5], to: [1, 0, 0], color: '#f43f5e' },
]

function Scene() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05
    }
  })

  return (
    <>
      <Stars />
      <GridFloor />
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 0]} intensity={2} color="#6366f1" />
      <pointLight position={[-5, 0, 3]} intensity={1} color="#06b6d4" />
      <pointLight position={[5, 0, -3]} intensity={1} color="#10b981" />

      <group ref={groupRef}>
        {EDGES.map((edge, i) => (
          <ConnectionLine key={i} from={edge.from} to={edge.to} color={edge.color} />
        ))}
        {EDGES.map((edge, i) => (
          <ParticleFlow key={i} from={edge.from} to={edge.to} color={edge.color} count={4} speed={0.5 + i * 0.1} />
        ))}
        {NODES.map(node => (
          <PipelineNode
            key={node.id}
            position={node.position}
            color={node.color}
            label={node.label}
            scale={node.scale}
            icon={node.icon}
            variant={node.variant}
          />
        ))}
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
      </EffectComposer>
    </>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function PipelineScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 7], fov: 65 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', touchAction: 'none' }}
    >
      <Scene />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 4}
      />
    </Canvas>
  )
}
