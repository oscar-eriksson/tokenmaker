import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { SUBTRACTION, INTERSECTION, ADDITION, Evaluator, Brush } from 'three-bvh-csg';

// Uniformly offset a 2D polygon outline by `amount` using miter/bevel joins.
// Bevel join is used when the miter would exceed 2× the offset (matches SVG miter-limit=2),
// which avoids giant spikes at acute corners (e.g. apex of "A") that would widen the 3D cutter
// far beyond the 2D stroke-linejoin:round appearance.
function offsetContour(pts: THREE.Vector2[], amount: number): THREE.Vector2[] {
    const n = pts.length;
    const result: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
        const a = pts[(i - 1 + n) % n];
        const b = pts[i];
        const c = pts[(i + 1) % n];
        const e1 = new THREE.Vector2(b.x - a.x, b.y - a.y);
        const e2 = new THREE.Vector2(c.x - b.x, c.y - b.y);
        if (e1.length() < 1e-9 || e2.length() < 1e-9) { result.push(b.clone()); continue; }
        e1.normalize(); e2.normalize();
        // Left-hand normals — outward for CCW polygon in Y-up coords
        const n1x = -e1.y, n1y = e1.x;
        const n2x = -e2.y, n2y = e2.x;
        // Miter bisector
        const bx = n1x + n2x, by = n1y + n2y;
        const bLen = Math.sqrt(bx * bx + by * by);
        if (bLen < 1e-6) {
            result.push(new THREE.Vector2(b.x + n1x * amount, b.y + n1y * amount));
        } else {
            const bnx = bx / bLen, bny = by / bLen;
            const dot = bnx * n1x + bny * n1y;
            // Cap miter at 2× the offset (SVG default miter-limit ≈ 2) to avoid spikes at acute
            // corners. Two-vertex bevel join was avoided because it self-intersects at concave
            // corners in glyph outlines (e.g. serif feet), producing broken geometry.
            const miter = amount / Math.max(dot, 0.5);
            result.push(new THREE.Vector2(b.x + bnx * miter, b.y + bny * miter));
        }
    }
    return result;
}

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

    // 1. Base with fillets — extrude a circle along Z with bevel so the top/bottom
    //    edges are rounded (fillet radius ≈ 15% of height, capped at 1 mm).
    const radius = options.width / 2;
    const filletR = Math.min(1.0, options.height * 0.15);
    const baseDepth = Math.max(0.5, options.height - 2 * filletR); // straight-wall section
    const circleShape = new THREE.Shape();
    circleShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const baseGeom = new THREE.ExtrudeGeometry(circleShape, {
        depth: baseDepth,
        curveSegments: 64,
        bevelEnabled: true,
        bevelSize: filletR,
        bevelThickness: filletR,
        bevelSegments: 5,
    });
    // Total Z extent = 2*filletR + baseDepth = options.height; centre at z = 0
    baseGeom.translate(0, 0, -(options.height / 2));
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
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
        // Bevel gives the letter rounded top edges matching the 2D stroke-linejoin:round look.
        // Keep bevel small so it doesn't extend past the cutter boundary (avoids CSG artifacts).
        // Subtract 2×bevelSz from depth so the total Z span stays exactly textDepth
        // (ExtrudeGeometry adds bevelThickness to both front and back, so depth + 2×BT = textDepth).
        const bevelSz = Math.max(0, Math.min(options.textStrokeSize * 0.4, options.textDepth * 0.35));
        // Three.js TTFLoader uses scale = 100000/(UPM*72) instead of 1000/UPM, making text render
        // 100/72 ≈ 1.389× larger than the equivalent CSS font-size. Compensate so size=N in 3D
        // matches font-size=N in the 2D SVG preview.
        const ttfSize = options.textSize * (72 / 100);
        const textGeom = new TextGeometry(options.label, {
            font: font,
            size: ttfSize,
            depth: Math.max(0.1, options.textDepth + overlap - 2 * bevelSz),
            curveSegments: 12,
            bevelEnabled: bevelSz > 0,
            bevelSize: bevelSz,
            bevelThickness: bevelSz,
            bevelSegments: 3,
        });
        textGeom.computeBoundingBox();
        const textCenter = textGeom.boundingBox!.getCenter(new THREE.Vector3());
        textGeom.translate(-textCenter.x, -textCenter.y, -(options.textDepth + overlap) / 2);
        const textMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        textMeshToRender = new THREE.Mesh(textGeom, textMat);
        textMeshToRender.position.set(options.textPosX, options.textPosY, topZ + (options.textDepth - overlap) / 2 - overlap);
        textMeshToRender.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);

        // Outer cutter: per-edge uniform offset (not font-size scaling) so that the stroke
        // is the same width on ALL sides of each letter stroke, not dependent on distance
        // from the bounding box center.
        const letterShapes = font.generateShapes(options.label, ttfSize);
        // Cutter must expand by (strokeAmt + bevelSz) so the visible white channel =
        // (strokeAmt + bevelSz) - bevelSz = strokeAmt — matching the 2D stroke width exactly.
        const strokeAmt = options.textStrokeSize + bevelSz;
        const outerOnlyShapes = letterShapes.map(s => {
            const pts = s.getPoints(12);
            const expanded = offsetContour(pts, strokeAmt);
            return new THREE.Shape(expanded);
        });

        // Depth: spans from base bottom through icon top, no larger than needed
        const cutDepth = options.height + options.iconDepth + 1;
        const cutterGeom = new THREE.ExtrudeGeometry(outerOnlyShapes, { depth: cutDepth, bevelEnabled: false });
        cutterGeom.computeBoundingBox();
        const cutterCenter = cutterGeom.boundingBox!.getCenter(new THREE.Vector3());
        cutterGeom.translate(-cutterCenter.x, -cutterCenter.y, -cutDepth / 2);
        textOuterCutterBrush = new Brush(cutterGeom, new THREE.MeshBasicMaterial());
        textOuterCutterBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
        // Position cutter center halfway between base-bottom and icon-top
        textOuterCutterBrush.position.set(options.textPosX, options.textPosY, options.iconDepth / 2);
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
            // Compute 2D bounds from shapes (no temp geometry needed)
            const bbox2 = new THREE.Box2();
            for (const shape of allShapes) {
                for (const pt of shape.getPoints()) bbox2.expandByPoint(pt);
            }
            const center2 = bbox2.getCenter(new THREE.Vector2());
            const size2 = bbox2.getSize(new THREE.Vector2());
            const maxDim = Math.max(size2.x, size2.y);
            const scale = Math.max(0, options.width - options.iconMargin * 2) / maxDim;

            // Icon fillet: round the top edges of the raised icon.
            // bevelSize is in SVG units (XY scaled by `scale`); bevelThickness is in mm (Z not scaled).
            // Subtract 2×iconFilletMM from depth so total Z span stays exactly iconDepth + overlap.
            const iconFilletMM = 0.3;
            const iconBevelXY = scale > 0 ? iconFilletMM / scale : 0;

            const iconGeom = new THREE.ExtrudeGeometry(allShapes, {
                depth: Math.max(0.1, options.iconDepth + overlap - 2 * iconFilletMM),
                bevelEnabled: true,
                bevelSize: iconBevelXY,
                bevelThickness: iconFilletMM,
                bevelSegments: 3,
            });

            iconMesh = new THREE.Mesh(iconGeom, material);
            iconGeom.translate(-center2.x, -center2.y, -(options.iconDepth + overlap) / 2);

            iconMesh.scale.set(scale, -scale, 1);
            // Push icon down by `overlap` so it embeds into the base cleanly
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
                cutterGeom.translate(-center2.x, -center2.y, -cutterDepth / 2);
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
