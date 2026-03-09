import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const MIN_DESC_LINES = 6

export function DescriptionClamp({
  text,
  expanded,
  onToggle,
  maxHeight,
  className,
  renderText,
}: {
  text: string
  expanded: boolean
  onToggle: () => void
  maxHeight: number | null
  className?: string
  renderText?: (text: string) => ReactNode
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  // -2 = not measured, -1 = fits entirely, >= 0 = char cutoff
  const [cutoff, setCutoff] = useState(-2)

  useLayoutEffect(() => {
    setCutoff(-2)
  }, [text, maxHeight])

  useLayoutEffect(() => {
    if (expanded) return
    if (maxHeight == null || maxHeight <= 0) return
    const el = ref.current
    if (!el) return

    const w = el.clientWidth
    if (w === 0) return

    const tmp = document.createElement('p')
    tmp.className = el.className
    tmp.style.cssText = `position:fixed;visibility:hidden;top:-9999px;width:${w}px`
    document.body.appendChild(tmp)

    tmp.textContent = text
    const lineH = parseFloat(getComputedStyle(tmp).lineHeight)
    const minH = lineH * MIN_DESC_LINES
    const effectiveMax = Math.max(maxHeight, minH)

    if (tmp.scrollHeight <= effectiveMax + 1) {
      document.body.removeChild(tmp)
      setCutoff(-1)
      return
    }

    const words = text.split(/\s+/)
    let lo = 1
    let hi = words.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      tmp.textContent = words.slice(0, mid).join(' ') + '… Show more'
      if (tmp.scrollHeight <= effectiveMax + 1) lo = mid
      else hi = mid - 1
    }

    document.body.removeChild(tmp)
    setCutoff(words.slice(0, lo).join(' ').length)
  }, [text, expanded, maxHeight, cutoff])

  const toggleBtn = (label: string) => (
    <button
      type="button"
      className="text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-600"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
    >
      {label}
    </button>
  )

  if (expanded) {
    return (
      <p className={className ?? 'text-[15px] leading-relaxed text-slate-500'}>
        {renderText ? renderText(text) : text} {toggleBtn('Show less')}
      </p>
    )
  }

  if (cutoff === -2) {
    return (
      <p
        ref={ref}
        className={className ?? 'text-[15px] leading-relaxed text-slate-500'}
        style={{ height: 0, overflow: 'hidden' }}
      >
        {text}
      </p>
    )
  }

  if (cutoff === -1) {
    return (
      <p ref={ref} className={className ?? 'text-[15px] leading-relaxed text-slate-500'}>
        {renderText ? renderText(text) : text}
      </p>
    )
  }

  const truncated = text.slice(0, cutoff).trimEnd()
  return (
    <p ref={ref} className={className ?? 'text-[15px] leading-relaxed text-slate-500'}>
      {renderText ? renderText(truncated) : truncated}… {toggleBtn('Show more')}
    </p>
  )
}
