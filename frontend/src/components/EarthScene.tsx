/**
 * EarthScene — Photorealistic interactive 3D Earth hero backdrop.
 *
 * Uses real NASA/Solar System Scope textures:
 *   - earth_daymap.jpg   — colour/albedo map
 *   - earth_normal.jpg   — surface normal map (mountains, ocean floors)
 *   - earth_specular.jpg — specular/water reflectivity map
 *   - earth_clouds.jpg   — animated cloud layer
 *
 * Features:
 *   - Earth self-rotates slowly (breathing/churning)
 *   - Cloud layer counter-rotates at a slightly different speed
 *   - Atmospheric Fresnel glow on the limb
 *   - Space background (stars + nebula clouds) reacts to mouse cursor
 */
import { useRef, useMemo, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { Stars, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { TextureLoader } from 'three'

// ── Photorealistic Earth ──────────────────────────────────────────────────────
function Earth() {
  const meshRef  = useRef<THREE.Mesh>(null!)
  const cloudsRef = useRef<THREE.Mesh>(null!)
  const atmRef   = useRef<THREE.Mesh>(null!)

  // Load all four real textures in parallel
  const [dayMap, normalMap, specularMap, cloudMap] = useLoader(TextureLoader, [
    '/textures/earth_daymap.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth_specular.jpg',
    '/textures/earth_clouds.jpg',
  ])

  // Improve texture filtering
  useMemo(() => {
    [dayMap, normalMap, specularMap, cloudMap].forEach(t => {
      t.anisotropy = 8
      t.minFilter = THREE.LinearMipmapLinearFilter
    })
  }, [dayMap, normalMap, specularMap, cloudMap])

  useFrame((_, delta) => {
    // Earth: one full rotation every ~40 seconds (realistic but visible)
    if (meshRef.current)  meshRef.current.rotation.y  += delta * 0.055
    // Clouds: slightly faster drift
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.072
    // Atmosphere: slow pulse (breathing)
    if (atmRef.current) {
      const t = Date.now() * 0.001
      atmRef.current.scale.setScalar(1.06 + Math.sin(t * 0.35) * 0.007)
    }
  })

  return (
    <group>
      {/* Core Earth — phong for specular highlights */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <sphereGeometry args={[1, 128, 128]} />
        <meshPhongMaterial
          map={dayMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(2, 2)}
          specularMap={specularMap}
          specular={new THREE.Color(0x4488cc)}
          shininess={45}
        />
      </mesh>

      {/* Cloud layer — alpha-blended over the surface */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[1.008, 64, 64]} />
        <meshPhongMaterial
          map={cloudMap}
          transparent
          opacity={0.42}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Inner atmospheric glow — Fresnel-like limb brightening */}
      <mesh ref={atmRef}>
        <sphereGeometry args={[1.055, 48, 48]} />
        <meshBasicMaterial
          color={new THREE.Color(0x1a66ff)}
          transparent
          opacity={0.10}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outer haze ring */}
      <mesh>
        <sphereGeometry args={[1.18, 32, 32]} />
        <meshBasicMaterial
          color={new THREE.Color(0x0044cc)}
          transparent
          opacity={0.04}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sun-like key light from upper-right */}
      <directionalLight
        position={[6, 3, 5]}
        intensity={2.8}
        color="#fff6e8"
        castShadow
      />
      {/* Faint blue fill from opposite side (earthshine) */}
      <directionalLight position={[-4, -2, -4]} intensity={0.12} color="#2255cc" />
      {/* Deep ambient — keeps dark side barely visible */}
      <ambientLight intensity={0.08} color="#112244" />
    </group>
  )
}

// ── Coloured nebula particles ─────────────────────────────────────────────────
function NebulaClouds() {
  const groupRef = useRef<THREE.Group>(null!)

  const { positions, colors } = useMemo(() => {
    const count = 280
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    const palette   = [
      new THREE.Color('#6366F1'), new THREE.Color('#818CF8'),
      new THREE.Color('#22D3EE'), new THREE.Color('#a855f7'),
      new THREE.Color('#34D399'), new THREE.Color('#93c5fd'),
    ]
    for (let i = 0; i < count; i++) {
      const r     = 7 + Math.random() * 10
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos((Math.random() * 2) - 1)
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
      const c = palette[Math.floor(Math.random() * palette.length)]
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    return { positions, colors }
  }, [])

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.getElapsedTime()
      groupRef.current.rotation.y  = t * 0.015
      groupRef.current.rotation.x  = Math.sin(t * 0.007) * 0.04
    }
  })

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color"    args={[colors,    3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.07}
          vertexColors
          transparent
          opacity={0.55}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  )
}

// ── Mouse-reactive camera ─────────────────────────────────────────────────────
function CameraRig() {
  const { camera, gl } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = gl.domElement
    const handler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.current.x = ((e.clientX - rect.left) / rect.width  - 0.5) * 2
      mouse.current.y = ((e.clientY - rect.top)  / rect.height - 0.5) * 2
    }
    canvas.addEventListener('mousemove', handler)
    return () => canvas.removeEventListener('mousemove', handler)
  }, [gl.domElement])

  useFrame(() => {
    const targetX =  mouse.current.y * 0.22
    const targetY =  mouse.current.x * 0.30
    camera.position.x += (targetY - camera.position.x) * 0.035
    camera.position.y += (-targetX - camera.position.y) * 0.035
    camera.lookAt(0, 0, 0)
  })

  return null
}

// ── Suspense fallback ─────────────────────────────────────────────────────────
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#0a1a3a" wireframe opacity={0.3} transparent />
    </mesh>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────
interface EarthSceneProps {
  className?: string
}

export default function EarthScene({ className = '' }: EarthSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 3.2], fov: 42 }}
      className={className}
      style={{ background: 'transparent' }}
      gl={{ alpha: true, antialias: true, logarithmicDepthBuffer: true }}
      shadows
    >
      <CameraRig />
      <Suspense fallback={<LoadingFallback />}>
        <Earth />
      </Suspense>
      <NebulaClouds />
      <Stars
        radius={100}
        depth={80}
        count={6000}
        factor={3.5}
        saturation={0.5}
        fade
        speed={0.2}
      />
      <Preload all />
    </Canvas>
  )
}
