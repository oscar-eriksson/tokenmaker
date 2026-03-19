import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { createTokenGroup, type TokenOptions } from './tokenGenerator';

export async function exportTokens(config: any) {
    const exporter = new STLExporter();
    const zip = new JSZip();

    // Parse labels into sequence
    const labelParts = config.labels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

    if (labelParts.length === 0) {
        // Export single token with empty label
        labelParts.push('');
    }

    for (const label of labelParts) {
        const options: TokenOptions = {
            width: config.width,
            height: config.height,
            svgContent: config.svgContent,
            label: label,
            textPosX: config.textPosX,
            textPosY: config.textPosY,
            textRotation: config.textRotation,
            textSize: config.textSize,
            textDepth: config.textDepth,
            textStrokeSize: config.textStrokeSize,
            iconPosX: config.iconPosX,
            iconPosY: config.iconPosY,
            iconMargin: config.iconMargin,
            iconDepth: config.iconDepth
        };

        const group = await createTokenGroup(options);

        // Convert to mesh for STL exporter
        // STLExporter expects meshes. group might have groups of meshes.
        // Ensure world matrices are updated
        group.updateMatrixWorld(true);

        // The STLExporter with { binary: true } returns a DataView.
        // JSZip accepts ArrayBuffer, so we pass the underlying buffer.
        const stlData = exporter.parse(group, { binary: true }) as DataView;
        const filename = label ? `token_${label}.stl` : 'token.stl';
        zip.file(filename, stlData.buffer);
    }

    // Generate zip and save
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'dnd_tokens.zip');
}
