import * as React from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  )
  const thumbsOverlap = _values.length >= 2 && _values[0] === _values[1]

  return (
    <SliderPrimitive.Root
      className={cn('w-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative my-0.5 h-1.5 grow overflow-hidden rounded-sm bg-slate-200 select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="h-full bg-primary select-none"
            style={thumbsOverlap ? { minWidth: 12, marginInlineStart: -6 } : undefined}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              'relative block size-[0.8rem] shrink-0 rounded-full border border-ring bg-white shadow-xs ring-ring/60 transition-[color,box-shadow] select-none hover:ring-2 active:ring-3 disabled:pointer-events-none disabled:opacity-50 has-[:focus]:ring-2 has-[:focus]:outline-hidden',
              thumbsOverlap ? 'after:absolute after:-inset-0.5' : 'after:absolute after:-inset-1.5',
            )}
            style={
              thumbsOverlap
                ? {
                    marginInlineStart: index === 0 ? -6 : 6,
                    zIndex: index === 0 ? 2 : 1,
                  }
                : undefined
            }
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
