import type { HTMLAttributes } from 'react'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'gold' | 'accent'

export function Badge({
  tone = 'neutral',
  className = '',
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={`badge badge--${tone} ${className}`.trim()} {...rest} />
}
