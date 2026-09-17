interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: number
}

export default function Avatar({ name, src, size = 28 }: AvatarProps) {
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ''} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent-blue/20 font-mono font-bold text-accent-blue"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  )
}
