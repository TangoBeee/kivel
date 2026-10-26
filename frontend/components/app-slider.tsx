'use client';
import * as Slider from '@radix-ui/react-slider';
import type { ComponentProps } from 'react';
export function AppSlider({
    'aria-label': label,
    className,
    ...props
}: ComponentProps<typeof Slider.Root> & { 'aria-label': string }) {
    return (
        <Slider.Root {...props} className={`app-slider ${className ?? ''}`}>
            <Slider.Track className="app-slider-track">
                <Slider.Range className="app-slider-range" />
            </Slider.Track>
            {(props.value ?? props.defaultValue ?? [0]).map((_, index) => (
                <Slider.Thumb key={index} className="app-slider-thumb" aria-label={label} />
            ))}
        </Slider.Root>
    );
}
