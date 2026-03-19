import { writable } from 'svelte/store';

export const isDragging = writable(false);
export const isGenerating = writable(false);

export const tokenConfig = writable({
    width: 25,
    height: 5,
    iconName: null as string | null,
    svgContent: null as string | null,
    labels: 'A, B, C',
    textPosX: 0,
    textPosY: 0,
    textRotation: 0,
    textSize: 10,
    textDepth: 2,
    textStrokeSize: 1,
    iconPosX: 0,
    iconPosY: 0,
    iconMargin: 2, // gap between icon boundary and edge of base cylinder
    iconDepth: 2,
});

export const exportStatus = writable({
    active: false,
    current: 0,
    total: 0,
    label: ''
});
