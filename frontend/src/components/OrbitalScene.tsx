/**
 * OrbitalScene — Three.js 3D component for rendering an exoplanet system.
 *
 * Features:
 *   - Multi-layered glowing star with corona, halo and volumetric glow
 *   - Procedural noise-based planet shaders per size class (Fresnel rim glow)
 *   - Detailed gas-giant rings with opacity falloff
 *   - Dashed orbit paths
 *   - Translucent glowing habitable zone torus
 *   - Rich background starfield
 *   - Multi-source lighting (ambient + point + hemisphere)
 */
import { useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars, OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { StarData, PlanetData, HabitableZone } from '../api'

// ---- Visual Scale Helpers ----
const PLANET_SCALE = 0.035
const MAX_PLANET_RADIUS = 0.45

export function getVisualOrbitRadius(
  au: number,
  index: number,
  starVisualRadius: number
): number {
  return starVisualRadius + 2.2 + Math.sqrt(au) * 8.5 + index * 0.9
}

// ---- Planet color palette ----
const PLANET_COLORS: Record<string, string> = {
  'Sub-Earth': '#8B8D94',
  'Earth-size': '#4B9CD3',
  'Super-Earth': '#2DD4A8',
  'Sub-Neptune': '#7C6BF0',
  'Neptune-size': '#3B6BF5',
  'Jupiter-size': '#D4A048',
}

// ---- Atmosphere / rim glow colors ----
const ATMOSPHERE_COLORS: Record<string, string> = {
  'Sub-Earth': '#B0B3BC',
  'Earth-size': '#87CEEB',
  'Super-Earth': '#5EFFD4',
  'Sub-Neptune': '#A895FF',
  'Neptune-size': '#6DA0FF',
  'Jupiter-size': '#FFCC66',
}

interface OrbitalSceneProps {
  star: StarData
  planets: PlanetData[]
  habitableZone: HabitableZone
  animationTime: number
}

// =========================================================================
//  GLSL Noise helpers (shared by all planet shaders)
// =========================================================================
const NOISE_GLSL = /* glsl */ `
// Classic 3D simplex-style noise (Ashima Arts)
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`

// Common vertex shader for all planets (passes vNormal, vPosition, vUv)
const PLANET_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// ---- Per-class fragment shaders ----

function earthLikeFragment(baseHex: string, isSuper: boolean): string {
  const c = new THREE.Color(baseHex)
  const land = isSuper ? 'vec3(0.18, 0.72, 0.55)' : 'vec3(0.22, 0.55, 0.30)'
  return /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 ocean = vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)});
  vec3 land  = ${land};
  vec3 cloud = vec3(0.92, 0.95, 0.98);
  vec3 ice   = vec3(0.85, 0.92, 0.97);

  // Continental noise
  float continent = fbm(vec3(vUv * 5.0, uTime * 0.02), 5);
  float landMask  = smoothstep(-0.05, 0.15, continent);

  // Cloud layer (different frequency, drifts)
  float clouds = fbm(vec3(vUv * 6.0 + uTime * 0.04, uTime * 0.01 + 10.0), 4);
  float cloudMask = smoothstep(0.1, 0.45, clouds);

  // Ice caps
  float lat = abs(vUv.y - 0.5) * 2.0;
  float iceMask = smoothstep(0.78, 0.92, lat);

  vec3 surface = mix(ocean, land, landMask);
  surface = mix(surface, ice, iceMask);
  surface = mix(surface, cloud, cloudMask * 0.55);

  // Lambertian diffuse
  vec3 lightDir = normalize(-vPosition);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.12;

  // Fresnel rim glow
  float fresnel = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.0);
  vec3 rim = vec3(0.4, 0.7, 1.0) * fresnel * 0.6;

  vec3 color = surface * (ambient + diff * 0.9) + rim;
  gl_FragColor = vec4(color, 1.0);
}
`
}

const subEarthFragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 base  = vec3(0.54, 0.55, 0.58);
  vec3 dark  = vec3(0.32, 0.31, 0.34);
  vec3 light = vec3(0.68, 0.67, 0.70);

  // Rocky terrain noise
  float rock = fbm(vec3(vUv * 8.0, uTime * 0.005), 5);
  float craters = snoise(vec3(vUv * 14.0, 0.0));
  craters = smoothstep(0.35, 0.5, craters);

  vec3 surface = mix(base, light, smoothstep(-0.3, 0.3, rock));
  surface = mix(surface, dark, craters * 0.6);

  // Lambertian
  vec3 lightDir = normalize(-vPosition);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.1;

  // Subtle warm Fresnel rim
  float fresnel = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.5);
  vec3 rim = vec3(0.7, 0.6, 0.5) * fresnel * 0.35;

  vec3 color = surface * (ambient + diff * 0.85) + rim;
  gl_FragColor = vec4(color, 1.0);
}
`

const neptuneFragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 deep   = vec3(0.10, 0.25, 0.78);
  vec3 bright = vec3(0.30, 0.60, 0.96);
  vec3 band   = vec3(0.15, 0.40, 0.90);

  // Horizontal bands
  float lat = vUv.y;
  float bands = sin(lat * 28.0 + uTime * 0.06) * 0.5 + 0.5;
  bands = smoothstep(0.3, 0.7, bands);

  // Atmospheric turbulence
  float turb = fbm(vec3(vUv.x * 6.0, lat * 4.0, uTime * 0.03), 4);

  vec3 surface = mix(deep, bright, bands * 0.5 + turb * 0.3);
  surface = mix(surface, band, smoothstep(0.2, 0.5, turb) * 0.3);

  // Lambertian
  vec3 lightDir = normalize(-vPosition);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.1;

  // Cyan Fresnel rim
  float fresnel = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.0);
  vec3 rim = vec3(0.3, 0.6, 1.0) * fresnel * 0.65;

  vec3 color = surface * (ambient + diff * 0.9) + rim;
  gl_FragColor = vec4(color, 1.0);
}
`

const subNeptuneFragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 deep   = vec3(0.30, 0.24, 0.75);
  vec3 bright = vec3(0.55, 0.48, 0.98);
  vec3 accent = vec3(0.40, 0.35, 0.88);

  float lat = vUv.y;
  float bands = sin(lat * 22.0 + uTime * 0.05) * 0.5 + 0.5;
  bands = smoothstep(0.35, 0.65, bands);

  float turb = fbm(vec3(vUv.x * 5.0, lat * 3.5, uTime * 0.025), 4);

  vec3 surface = mix(deep, bright, bands * 0.45 + turb * 0.25);
  surface = mix(surface, accent, smoothstep(0.15, 0.45, turb) * 0.25);

  vec3 lightDir = normalize(-vPosition);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.1;

  float fresnel = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.0);
  vec3 rim = vec3(0.55, 0.45, 1.0) * fresnel * 0.6;

  vec3 color = surface * (ambient + diff * 0.9) + rim;
  gl_FragColor = vec4(color, 1.0);
}
`

const jupiterFragment = /* glsl */ `
${NOISE_GLSL}
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 cream  = vec3(0.90, 0.78, 0.55);
  vec3 amber  = vec3(0.83, 0.63, 0.28);
  vec3 brown  = vec3(0.55, 0.35, 0.18);
  vec3 white  = vec3(0.95, 0.92, 0.85);
  vec3 red    = vec3(0.72, 0.32, 0.18);

  float lat = vUv.y;

  // Prominent horizontal cloud bands — multiple frequencies
  float band1 = sin(lat * 32.0 + uTime * 0.04) * 0.5 + 0.5;
  float band2 = sin(lat * 18.0 - uTime * 0.02 + 1.5) * 0.5 + 0.5;
  float band3 = sin(lat * 50.0 + 3.0) * 0.5 + 0.5;
  float bands = band1 * 0.45 + band2 * 0.35 + band3 * 0.2;

  // Turbulent swirls
  float turb = fbm(vec3(vUv.x * 8.0, lat * 5.0, uTime * 0.02), 5);
  float swirl = fbm(vec3(vUv.x * 3.0 + turb, lat * 8.0 + turb * 0.5, uTime * 0.015), 4);

  // Mix palette
  vec3 surface = mix(cream, amber, smoothstep(0.3, 0.7, bands));
  surface = mix(surface, brown, smoothstep(0.5, 0.8, bands) * 0.6);
  surface = mix(surface, white, smoothstep(0.15, 0.35, band3) * 0.3);

  // Great Red Spot analog (near equator-ish)
  float spotDist = length(vec2((vUv.x - 0.35) * 2.5, (lat - 0.42) * 8.0));
  float spot = 1.0 - smoothstep(0.0, 1.0, spotDist);
  surface = mix(surface, red, spot * 0.55);

  // Swirl disturbance
  surface += vec3(swirl * 0.06);

  // Lambertian
  vec3 lightDir = normalize(-vPosition);
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.1;

  // Warm golden Fresnel rim
  float fresnel = pow(1.0 - max(dot(vNormal, normalize(-vPosition)), 0.0), 3.0);
  vec3 rim = vec3(1.0, 0.8, 0.4) * fresnel * 0.5;

  vec3 color = surface * (ambient + diff * 0.9) + rim;
  gl_FragColor = vec4(color, 1.0);
}
`

// =========================================================================
//  Ring shader (opacity falloff from inner to outer edge)
// =========================================================================
const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

function ringFragment(hexColor: string): string {
  const c = new THREE.Color(hexColor)
  return /* glsl */ `
varying vec2 vUv;
void main() {
  vec3 col = vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)});

  // Radial position 0 = inner, 1 = outer (UVs of ringGeometry go 0→1 radially)
  float r = vUv.x;

  // Bands of opacity for ring detail
  float band1 = smoothstep(0.0, 0.15, r) * (1.0 - smoothstep(0.85, 1.0, r));
  float band2 = 0.7 + 0.3 * sin(r * 40.0);
  float band3 = 0.85 + 0.15 * sin(r * 120.0);
  float alpha = band1 * band2 * band3 * 0.45;

  // Slight color variation across rings
  col = mix(col, col * 1.25, sin(r * 25.0) * 0.5 + 0.5);
  col = mix(col * 0.7, col, r);

  gl_FragColor = vec4(col, alpha);
}
`
}

// =========================================================================
//  Star component — multi-layered corona + volumetric glow
// =========================================================================
function GlowingStar({ color, radius, onStarClick }: { color: string; radius: number; onStarClick: () => void }) {
  const coreRef = useRef<THREE.Mesh>(null)
  const glowSpriteRef = useRef<THREE.Sprite>(null)
  const outerSpriteRef = useRef<THREE.Sprite>(null)

  const starRadius = Math.min(Math.max(radius * 0.8, 0.4), 1.5)

  // Generate radial gradient texture programmatically for a natural, smooth falloff glow
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
      gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)')
      gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.95)')
      gradient.addColorStop(0.2, 'rgba(255, 252, 240, 0.8)')
      gradient.addColorStop(0.4, 'rgba(255, 210, 140, 0.45)')
      gradient.addColorStop(0.6, 'rgba(255, 150, 70, 0.18)')
      gradient.addColorStop(0.8, 'rgba(255, 90, 20, 0.05)')
      gradient.addColorStop(1.0, 'rgba(255, 40, 5, 0.0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 256, 256)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  // Pulsation
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const pulse = 1 + Math.sin(t * 1.2) * 0.015
    const slowPulse = 1 + Math.sin(t * 0.6) * 0.02
    if (coreRef.current) coreRef.current.scale.setScalar(pulse)
    if (glowSpriteRef.current) {
      glowSpriteRef.current.scale.set(starRadius * 4.5 * slowPulse, starRadius * 4.5 * slowPulse, 1)
    }
    if (outerSpriteRef.current) {
      outerSpriteRef.current.scale.set(starRadius * 9.5 * slowPulse, starRadius * 9.5 * slowPulse, 1)
      outerSpriteRef.current.material.opacity = 0.28 + Math.sin(t * 0.5) * 0.04
    }
  })

  const brightColor = useMemo(() => {
    const c = new THREE.Color(color)
    c.multiplyScalar(1.4)
    return c
  }, [color])

  return (
    <group>
      {/* 1. Core Sphere */}
      <mesh ref={coreRef} onClick={(e) => { e.stopPropagation(); onStarClick(); }}>
        <sphereGeometry args={[starRadius, 64, 64]} />
        <meshStandardMaterial
          color={brightColor}
          emissive={brightColor}
          emissiveIntensity={2.2}
          roughness={0.05}
          toneMapped={false}
        />
      </mesh>

      {/* 2. Natural Inner Glow (Sprite) */}
      <sprite ref={glowSpriteRef}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* 3. Volumetric Outer Corona Glow (Sprite) */}
      <sprite ref={outerSpriteRef}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* Point Light Source */}
      <pointLight color={color} intensity={3.5} distance={80} decay={1.6} />
    </group>
  )
}

// =========================================================================
//  Get the correct fragment shader for a planet's size class
// =========================================================================
function getFragmentShader(sizeClass: string): string {
  switch (sizeClass) {
    case 'Sub-Earth':
      return subEarthFragment
    case 'Earth-size':
      return earthLikeFragment(PLANET_COLORS['Earth-size'], false)
    case 'Super-Earth':
      return earthLikeFragment(PLANET_COLORS['Super-Earth'], true)
    case 'Sub-Neptune':
      return subNeptuneFragment
    case 'Neptune-size':
      return neptuneFragment
    case 'Jupiter-size':
      return jupiterFragment
    default:
      return subEarthFragment
  }
}

// =========================================================================
//  Planet component
// =========================================================================
function OrbitingPlanet({
  planet,
  index,
  starVisualRadius,
  animationTime,
  isFocused,
  onPlanetClick,
  isHovered,
  onHoverChange,
}: {
  planet: PlanetData
  index: number
  starVisualRadius: number
  animationTime: number
  isFocused: boolean
  onPlanetClick: () => void
  isHovered: boolean
  onHoverChange: (hovered: boolean) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const atmosphereRef = useRef<THREE.Mesh>(null)

  const orbitRadius = useMemo(
    () => getVisualOrbitRadius(planet.orbital_distance_au, index, starVisualRadius),
    [planet.orbital_distance_au, index, starVisualRadius]
  )

  const planetRadius = Math.min(planet.radius_rearth * PLANET_SCALE, MAX_PLANET_RADIUS)
  const planetColor = PLANET_COLORS[planet.size_class] || '#8B8D94'
  const atmosphereColor = ATMOSPHERE_COLORS[planet.size_class] || '#AAAACC'

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: getFragmentShader(planet.size_class),
      uniforms: {
        uTime: { value: 0.0 },
      },
    })
  }, [planet.size_class])

  const orbitLine = useMemo(() => {
    const pts: THREE.Vector3[] = []
    const segments = 256
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const line = new THREE.LineDashedMaterial({
      color: planetColor,
      transparent: true,
      opacity: isFocused ? 0.45 : 0.18,
      dashSize: 0.3,
      gapSize: 0.15,
    })
    const lineMesh = new THREE.Line(geo, line)
    lineMesh.computeLineDistances()
    return lineMesh
  }, [orbitRadius, planetColor, isFocused])

  const hasRings = planet.size_class === 'Jupiter-size' || planet.size_class === 'Neptune-size'

  const ringMaterial = useMemo(() => {
    if (!hasRings) return null
    return new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: ringFragment(planetColor),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  }, [hasRings, planetColor])

  useFrame(() => {
    if (!groupRef.current) return
    const speed = (2 * Math.PI) / (Math.max(planet.period_days, 0.5) * 1.5)
    const angle = animationTime * speed

    groupRef.current.position.x = Math.cos(angle) * orbitRadius
    groupRef.current.position.z = Math.sin(angle) * orbitRadius

    if (meshRef.current) {
      meshRef.current.rotation.y += 0.012
    }

    shaderMaterial.uniforms.uTime.value = animationTime * 0.5
  })

  return (
    <group>
      <primitive object={orbitLine} />

      <group ref={groupRef} name={planet.koi_name}>
        {/* Planet sphere */}
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation()
            onPlanetClick()
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
            onHoverChange(true)
          }}
          onPointerOut={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'auto'
            onHoverChange(false)
          }}
        >
          <sphereGeometry args={[planetRadius, 48, 48]} />
          <primitive object={shaderMaterial} attach="material" />
        </mesh>

        {/* Hover card info panel using HTML portal */}
        {isHovered && (
          <Html distanceFactor={8} position={[0, planetRadius * 1.8, 0]} pointerEvents="none">
            <div className="glass p-3.5 rounded-xl text-[11px] w-48 pointer-events-none select-none border border-border shadow-2xl backdrop-blur-xl text-text-primary">
              <div className="font-display font-bold text-white mb-1.5 text-xs tracking-tight">
                {planet.kepler_name || planet.koi_name}
              </div>
              <div className="text-[10px] text-text-secondary leading-relaxed font-sans space-y-0.5">
                <div><span className="text-text-muted font-mono uppercase text-[8px]">CLASS:</span> {planet.size_class}</div>
                <div><span className="text-text-muted font-mono uppercase text-[8px]">PERIOD:</span> {planet.period_days.toFixed(2)} d</div>
                <div><span className="text-text-muted font-mono uppercase text-[8px]">ORBIT:</span> {planet.orbital_distance_au.toFixed(4)} AU</div>
                <div><span className="text-text-muted font-mono uppercase text-[8px]">TEMP:</span> {planet.equilibrium_temp_k} K</div>
                <div>
                  <span className="text-text-muted font-mono uppercase text-[8px]">STATUS:</span>{' '}
                  <span className={planet.classification === 'CONFIRMED' ? 'text-habitable font-semibold' : 'text-solar font-semibold'}>
                    {planet.classification}
                  </span>
                </div>
              </div>
            </div>
          </Html>
        )}

        {/* Atmospheric rim glow */}
        <mesh ref={atmosphereRef} scale={1.12}>
          <sphereGeometry args={[planetRadius, 32, 32]} />
          <meshBasicMaterial
            color={atmosphereColor}
            transparent
            opacity={isFocused ? 0.24 : 0.12}
            side={THREE.BackSide}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>

        {/* Rings */}
        {hasRings && ringMaterial && (
          <mesh rotation={[Math.PI / 2.5, 0.15, 0]}>
            <ringGeometry args={[planetRadius * 1.35, planetRadius * 2.3, 64]} />
            <primitive object={ringMaterial} attach="material" />
          </mesh>
        )}
      </group>
    </group>
  )
}

// =========================================================================
//  Habitable zone — translucent flat ring (removed 3D torus)
// =========================================================================
function HabitableZoneRing({
  hz,
  starVisualRadius,
}: {
  hz: HabitableZone
  starVisualRadius: number
}) {
  const innerRadius = useMemo(
    () => getVisualOrbitRadius(hz.conservative.inner_au, 0, starVisualRadius),
    [hz.conservative.inner_au, starVisualRadius]
  )
  const outerRadius = useMemo(
    () => getVisualOrbitRadius(hz.conservative.outer_au, 0, starVisualRadius),
    [hz.conservative.outer_au, starVisualRadius]
  )

  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.05 + Math.sin(clock.getElapsedTime() * 0.4) * 0.015
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} ref={meshRef}>
      <ringGeometry args={[innerRadius, outerRadius, 128]} />
      <meshBasicMaterial
        color="#34d399"
        transparent
        opacity={0.06}
        side={THREE.DoubleSide}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  )
}

// =========================================================================
//  Main scene
// =========================================================================
export default function OrbitalScene({
  star,
  planets,
  habitableZone,
  animationTime,
}: OrbitalSceneProps) {
  const starVisualRadius = useMemo(
    () => Math.min(Math.max(star.radius_rsun * 0.8, 0.4), 1.5),
    [star.radius_rsun]
  )

  const [focusedPlanetName, setFocusedPlanetName] = useState<string | null>(null)
  const [hoveredPlanetName, setHoveredPlanetName] = useState<string | null>(null)

  const { scene } = useThree()
  const controlsRef = useRef<any>(null)

  // Zoom / Target Tracking loop
  useFrame(() => {
    if (controlsRef.current) {
      if (focusedPlanetName) {
        const targetObj = scene.getObjectByName(focusedPlanetName)
        if (targetObj) {
          const targetPos = new THREE.Vector3()
          targetObj.getWorldPosition(targetPos)
          controlsRef.current.target.lerp(targetPos, 0.08)
        }
      } else {
        controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.08)
      }
      controlsRef.current.update()
    }
  })

  return (
    <>
      <Stars
        radius={300}
        depth={120}
        count={7000}
        factor={5}
        saturation={0.2}
        fade
        speed={0.15}
      />

      <ambientLight intensity={0.04} color="#8899bb" />
      <hemisphereLight
        color="#4466aa"
        groundColor="#221100"
        intensity={0.08}
      />

      {/* Host star with natural glow and click reset */}
      <GlowingStar
        color={star.color.hex}
        radius={star.radius_rsun}
        onStarClick={() => setFocusedPlanetName(null)}
      />

      {/* Flat habitable zone boundaries */}
      <HabitableZoneRing hz={habitableZone} starVisualRadius={starVisualRadius} />

      {/* Orbiting planets */}
      {planets.map((planet, i) => (
        <OrbitingPlanet
          key={planet.koi_name}
          planet={planet}
          index={i}
          starVisualRadius={starVisualRadius}
          animationTime={animationTime}
          isFocused={focusedPlanetName === planet.koi_name}
          onPlanetClick={() => setFocusedPlanetName(
            focusedPlanetName === planet.koi_name ? null : planet.koi_name
          )}
          isHovered={hoveredPlanetName === planet.koi_name}
          onHoverChange={(hovered) => setHoveredPlanetName(hovered ? planet.koi_name : null)}
        />
      ))}

      {/* Dynamic OrbitControls */}
      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        minDistance={2}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </>
  )
}
