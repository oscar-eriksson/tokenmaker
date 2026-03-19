import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { SUBTRACTION, INTERSECTION, ADDITION, Evaluator, Brush } from 'three-bvh-csg';

// Helper to safely convert evaluated meshes back into CSG Brushes for continuous grouping
function toBrush(mesh: THREE.Mesh | Brush): Brush {
    if (mesh instanceof Brush) {
        mesh.updateMatrixWorld();
        return mesh;
    }
    const b = new Brush(mesh.geometry, mesh.material);
    b.position.copy(mesh.position);
    b.rotation.copy(mesh.rotation);
    b.scale.copy(mesh.scale);
    b.updateMatrixWorld();
    return b;
}

let cachedFont: Font | null = null;

export async function loadFont(): Promise<Font> {
    if (cachedFont) return cachedFont;

    return new Promise((resolve, reject) => {
        const loader = new TTFLoader();
        loader.load(
            '/fonts/Roboto-Black.ttf',
            (json) => {
                cachedFont = new Font(json);
                resolve(cachedFont);
            },
            undefined,
            (err) => reject(err)
        );
    });
}

export interface TokenOptions {
    width: number;
    height: number;
    svgContent: string | null;
    label: string;
    textPosX: number;
    textPosY: number;
    textRotation: number;
    textSize: number;
    textDepth: number;
    textStrokeSize: number;
    iconPosX: number;
    iconPosY: number;
    iconMargin: number; // Space around the icon (so it doesn't scrape the edge)
    iconDepth: number;
}

export async function createTokenGroup(options: TokenOptions): Promise<THREE.Group> {
    const group = new THREE.Group();
    const overlap = 0.1; // 0.1mm overlap for tight, manifold CSG unions

    // 1. Base Cylinder
    const radius = options.width / 2;
    const baseGeom = new THREE.CylinderGeometry(radius, radius, options.height, 64);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.rotation.x = Math.PI / 2; // point up
    baseMesh.updateMatrixWorld();

    let finalTokenMesh: THREE.Mesh = baseMesh;
    const evaluator = new Evaluator();
    evaluator.useGroups = true; // VERY IMPORTANT: Preserves multi-materials (colors) physically!

    // Z position for features to sit on top of the base
    const topZ = options.height / 2;

    // 2. Text Label — solid embossed letter, with outer cutter to carve into icon
    let iconMesh: THREE.Mesh | null = null;
    let textMeshToRender: THREE.Mesh | null = null;
    let textOuterCutterBrush: Brush | null = null;

    if (options.label.trim().length > 0) {
        const font = await loadFont();
        const textGeom = new TextGeometry(options.label, {
            font: font,
            size: options.textSize,
            depth: options.textDepth + overlap,
            curveSegments: 12,
            bevelEnabled: false,
        });
        textGeom.computeBoundingBox();
        const textCenter = textGeom.boundingBox!.getCenter(new THREE.Vector3());
        textGeom.translate(-textCenter.x, -textCenter.y, -(options.textDepth + overlap) / 2);
        const textMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        textMeshToRender = new THREE.Mesh(textGeom, textMat);
        textMeshToRender.position.set(options.textPosX, options.textPosY, topZ + (options.textDepth - overlap) / 2 - overlap);
        textMeshToRender.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);

        // Outer cutter: letter contours WITHOUT holes, so it removes the entire letter
        // footprint (including counter areas) from the icon, then the solid letter is
        // unioned back — this leaves counter holes as recesses through the icon.
        const letterShapes = font.generateShapes(options.label, options.textSize);
        const outerOnlyShapes = letterShapes.map(s => new THREE.Shape(s.getPoints(12)));
        const cutDepth = options.height * 4;
        const cutterGeom = new THREE.ExtrudeGeometry(outerOnlyShapes, {
            depth: cutDepth,
            bevelEnabled: false,
        });
        cutterGeom.translate(-textCenter.x, -textCenter.y, -cutDepth / 2);
        textOuterCutterBrush = new Brush(cutterGeom, new THREE.MeshBasicMaterial());
        textOuterCutterBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
        textOuterCutterBrush.position.set(options.textPosX, options.textPosY, topZ);
        // Expand cutter by textStrokeSize to carve a margin around the letter
        if (options.textStrokeSize > 0) {
            const strokeScale = 1 + (options.textStrokeSize * 2) / options.textSize;
            textOuterCutterBrush.scale.set(strokeScale, strokeScale, 1);
        }
        textOuterCutterBrush.updateMatrixWorld();
    }

    // 3. Icon (SVG) - Rendered after text to apply CSG cut
    let darkCutterBrush: Brush | null = null;
    if (options.svgContent) {
        const loader = new SVGLoader();
        const svgData = loader.parse(options.svgContent);

        const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const allShapes: THREE.Shape[] = [];

        const lightShapes: THREE.Shape[] = [];
        const darkShapes: THREE.Shape[] = [];
        const allNonBgShapes: THREE.Shape[] = [];

        for (const path of svgData.paths) {
            const c = path.color;
            const luminance = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

            const shapes = SVGLoader.createShapes(path);
            for (const shape of shapes) {
                const shapeGeom = new THREE.ShapeGeometry(shape);
                shapeGeom.computeBoundingBox();
                if (shapeGeom.boundingBox) {
                    const box = shapeGeom.boundingBox;
                    const w = box.max.x - box.min.x;
                    const h = box.max.y - box.min.y;
                    if (w >= 510 && h >= 510 && shape.holes.length === 0) {
                        continue; // skip full-canvas background fills
                    }
                }
                allNonBgShapes.push(shape);
                if (luminance >= 0.5) {
                    lightShapes.push(shape); // white/light = raised silhouette
                } else {
                    darkShapes.push(shape);  // dark = cutout areas
                }
            }
        }

        // Use light paths for extrusion; fall back to all if SVG is dark-only (custom SVGs)
        const useLight = lightShapes.length > 0;
        for (const shape of (useLight ? lightShapes : allNonBgShapes)) {
            allShapes.push(shape);
        }

        if (allShapes.length > 0) {
            const iconGeom = new THREE.ExtrudeGeometry(allShapes, {
                depth: options.iconDepth + overlap,
                bevelEnabled: false,
            });

            iconGeom.computeBoundingBox();
            const box = iconGeom.boundingBox!;
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);

            const diameterMinusMargins = Math.max(0, options.width - (options.iconMargin * 2));
            const targetSize = diameterMinusMargins;
            const scale = targetSize / maxDim;

            iconMesh = new THREE.Mesh(iconGeom, material);
            iconGeom.translate(-center.x, -center.y, -(options.iconDepth + overlap) / 2);

            iconMesh.scale.set(scale, -scale, 1);
            // Push icon down by `overlap` so it embeds into the base cylinder cleanly
            iconMesh.position.set(options.iconPosX, options.iconPosY, topZ + (options.iconDepth - overlap) / 2 - overlap);
            iconMesh.updateMatrixWorld();

            // Build cutter for: dark paths + compound-path holes from light shapes
            // Applied AFTER union so it cuts below the base surface (true recesses)
            const allCutoutShapes: THREE.Shape[] = [...(useLight ? darkShapes : [])];
            if (useLight) {
                for (const shape of lightShapes) {
                    for (const hole of shape.holes) {
                        allCutoutShapes.push(new THREE.Shape(hole.getPoints(12)));
                    }
                }
            }
            if (allCutoutShapes.length > 0) {
                // Depth spans iconDepth above the surface + iconDepth below = clear recess
                const cutterDepth = options.iconDepth * 2 + overlap;
                const cutterGeom = new THREE.ExtrudeGeometry(allCutoutShapes, {
                    depth: cutterDepth,
                    bevelEnabled: false,
                });
                cutterGeom.translate(-center.x, -center.y, -cutterDepth / 2);
                darkCutterBrush = new Brush(cutterGeom, new THREE.MeshBasicMaterial());
                darkCutterBrush.scale.set(scale, -scale, 1);
                // Position at topZ so cutter spans iconDepth above and below the surface
                darkCutterBrush.position.set(options.iconPosX, options.iconPosY, topZ + overlap / 2);
                darkCutterBrush.updateMatrixWorld();
            }
        }
    }

    // 4. Sequentially UNION everything via CSG to guarantee a Manifold STL Export
    // (A) Merge Vector Icon into Base
    if (iconMesh) {
        let finalIconBrush = toBrush(iconMesh);

        // Clip Icon bounds to Token Radius Margin
        const innerRadius = Math.max(0, radius - options.iconMargin);
        const clipGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, options.height * 10, 64);
        clipGeom.rotateX(Math.PI / 2);
        const clipBrush = new Brush(clipGeom, new THREE.MeshBasicMaterial());
        clipBrush.position.z = 0;
        clipBrush.updateMatrixWorld();

        finalIconBrush = toBrush(evaluator.evaluate(finalIconBrush, clipBrush, INTERSECTION));

        // Union the icon onto the base
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), finalIconBrush, ADDITION);

        // Subtract dark/hole areas AFTER union so they cut below the base surface (true recesses)
        if (darkCutterBrush) {
            finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), darkCutterBrush, SUBTRACTION);
        }
    }

    // (B) Carve letter footprint from icon/base, then union solid text back
    // This creates recesses for the counter (e.g. center of "A") and a stroke margin
    if (textMeshToRender) {
        if (textOuterCutterBrush) {
            finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), textOuterCutterBrush, SUBTRACTION);
        }
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), toBrush(textMeshToRender), ADDITION);
    }

    // Add the single, unified, manifold mesh to the scene
    group.add(finalTokenMesh);

    return group;
}
