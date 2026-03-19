import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { SUBTRACTION, INTERSECTION, ADDITION, Evaluator, Brush } from 'three-bvh-csg';
import * as ClipperLib from 'clipper-lib';

// Robust 2D polygon offsetting using ClipperLib
function offsetShapesRobust(shapes: THREE.Shape[], amount: number): THREE.Shape[] {
    const scale = 100000;
    const co = new ClipperLib.ClipperOffset();
    const joinType = ClipperLib.JoinType.jtRound;
    const endType = ClipperLib.EndType.etClosedPolygon;

    const paths: any[][] = [];
    for (const shape of shapes) {
        const outerPts = shape.getPoints(12); // Reduced from 24
        paths.push(outerPts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })));
        if (shape.holes && shape.holes.length > 0) {
            for (const hole of shape.holes) {
                const holePts = hole.getPoints(12);
                paths.push(holePts.map(p => ({ X: Math.round(p.x * scale), Y: Math.round(p.y * scale) })));
            }
        }
    }

    co.AddPaths(paths, joinType, endType);
    const solutionTree = new ClipperLib.PolyTree();
    co.Execute(solutionTree, amount * scale);
    const resultShapes: THREE.Shape[] = [];

    function parseNode(node: any) {
        if (!node.IsHole()) {
            const shapePts = node.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
            const shape = new THREE.Shape(shapePts);
            for (const child of node.Childs()) {
                const holePts = child.Contour().map((pt: any) => new THREE.Vector2(pt.X / scale, pt.Y / scale));
                shape.holes.push(new THREE.Path(holePts));
                for (const island of child.Childs()) {
                    parseNode(island);
                }
            }
            resultShapes.push(shape);
        }
    }
    for (const child of solutionTree.Childs()) parseNode(child);
    return resultShapes;
}

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
        loader.load('/fonts/Roboto-Black.ttf', (json) => {
            cachedFont = new Font(json);
            resolve(cachedFont);
        }, undefined, (err) => reject(err));
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
    iconMargin: number;
    iconDepth: number;
}

export async function createTokenGroup(options: TokenOptions): Promise<THREE.Group> {
    const group = new THREE.Group();
    const overlap = 0.1;

    // 1. Base
    const radius = options.width / 2;
    const filletR = Math.min(1.0, options.height * 0.15);
    const baseDepth = Math.max(0.5, options.height - 2 * filletR);
    const circleShape = new THREE.Shape();
    circleShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const baseGeom = new THREE.ExtrudeGeometry(circleShape, {
        depth: baseDepth,
        curveSegments: 32, // Further optimized
        bevelEnabled: true,
        bevelSize: filletR,
        bevelThickness: filletR,
        bevelSegments: 3,
    });
    baseGeom.translate(0, 0, -baseDepth / 2);
    const baseMesh = new THREE.Mesh(baseGeom, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    baseMesh.updateMatrixWorld();

    let finalTokenMesh: THREE.Mesh = baseMesh;
    const evaluator = new Evaluator();
    evaluator.useGroups = true;

    const topZ = options.height / 2;

    // 2. Text Prep
    let textCutterBrush: Brush | null = null;
    let textStrokeBrush: Brush | null = null;

    if (options.label.trim().length > 0) {
        const font = await loadFont();
        const ttfSize = options.textSize * (72 / 100);
        const letterShapes = font.generateShapes(options.label, ttfSize);

        const textGeom = new THREE.ExtrudeGeometry(letterShapes, { depth: options.textDepth + overlap, bevelEnabled: false, curveSegments: 6 });
        textGeom.computeBoundingBox();
        const textCenter = textGeom.boundingBox!.getCenter(new THREE.Vector3());

        const fData = (font as any).data;
        const scaleFact = ttfSize / (fData.resolution || 1000);
        const centralY = (((fData.ascender || 800) + (fData.descender || -200)) / 2) * scaleFact;

        textGeom.translate(-textCenter.x, -centralY, -(options.textDepth + overlap) / 2);
        
        const textMesh = new THREE.Mesh(textGeom, new THREE.MeshStandardMaterial({ color: 0x222222 }));
        textMesh.position.set(options.textPosX, options.textPosY, topZ - options.textDepth / 2);
        textMesh.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
        textMesh.updateMatrixWorld();
        textCutterBrush = toBrush(textMesh);

        // Stroke Mask
        const strokeShapes = offsetShapesRobust(letterShapes, options.textStrokeSize);
        const strokeGeom = new THREE.ExtrudeGeometry(strokeShapes, { depth: options.iconDepth + overlap, bevelEnabled: false, curveSegments: 6 });
        strokeGeom.translate(-textCenter.x, -centralY, -(options.iconDepth + overlap) / 2);
        textStrokeBrush = new Brush(strokeGeom, new THREE.MeshBasicMaterial());
        textStrokeBrush.position.set(options.textPosX, options.textPosY, topZ - (options.iconDepth - overlap) / 2);
        textStrokeBrush.rotation.z = THREE.MathUtils.degToRad(-options.textRotation);
        textStrokeBrush.updateMatrixWorld();
    }

    // 3. Icon Prep
    let iconCutterBrush: Brush | null = null;
    let iconHoleCutterBrush: Brush | null = null;
    if (options.svgContent) {
        const loader = new SVGLoader();
        const svgData = loader.parse(options.svgContent);
        const lightShapes: THREE.Shape[] = [];
        const darkShapes: THREE.Shape[] = [];

        for (const path of svgData.paths) {
            const luminance = 0.299 * path.color.r + 0.587 * path.color.g + 0.114 * path.color.b;
            const shapes = SVGLoader.createShapes(path);
            for (const shape of shapes) {
                const shapeGeom = new THREE.ShapeGeometry(shape);
                shapeGeom.computeBoundingBox();
                if (shapeGeom.boundingBox) {
                    const box = shapeGeom.boundingBox;
                    if (box.max.x - box.min.x >= 510) continue;
                }
                if (luminance >= 0.5) lightShapes.push(shape);
                else darkShapes.push(shape);
            }
        }

        if (darkShapes.length > 0) {
            const scale = Math.max(0, options.width - options.iconMargin * 2) / 512;
            const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            
            // 1. Create the main carving volume from dark shapes
            const darkGeom = new THREE.ExtrudeGeometry(darkShapes, { depth: options.iconDepth + overlap, bevelEnabled: false, curveSegments: 6 });
            darkGeom.translate(-256, -256, -(options.iconDepth + overlap) / 2);
            let darkBrush = new Brush(darkGeom, darkMat);
            darkBrush.scale.set(scale, -scale, 1);
            darkBrush.position.set(options.iconPosX, options.iconPosY, topZ - options.iconDepth / 2);
            darkBrush.updateMatrixWorld();

            // 2. If there are light shapes, they should be "islands" (subtracted from the cutter)
            if (lightShapes.length > 0) {
                const lightGeom = new THREE.ExtrudeGeometry(lightShapes, { depth: options.iconDepth + overlap * 2, bevelEnabled: false, curveSegments: 6 });
                lightGeom.translate(-256, -256, -(options.iconDepth + overlap * 2) / 2);
                const lightBrush = new Brush(lightGeom, new THREE.MeshBasicMaterial());
                lightBrush.scale.set(scale, -scale, 1);
                lightBrush.position.set(options.iconPosX, options.iconPosY, topZ - options.iconDepth / 2);
                lightBrush.updateMatrixWorld();

                // Mask out the eyes/light parts from the cowl carving volume
                darkBrush = toBrush(evaluator.evaluate(darkBrush, lightBrush, SUBTRACTION));
            }

            iconCutterBrush = darkBrush;

            // 3. Handle additional holes (internal SVG paths)
            const holeShapes: THREE.Shape[] = [];
            for (const s of [...darkShapes, ...lightShapes]) {
                for (const h of s.holes) holeShapes.push(new THREE.Shape(h.getPoints(8)));
            }
            if (holeShapes.length > 0) {
                const hGeom = new THREE.ExtrudeGeometry(holeShapes, { depth: options.iconDepth * 2, bevelEnabled: false, curveSegments: 6 });
                hGeom.translate(-256, -256, -options.iconDepth);
                iconHoleCutterBrush = new Brush(hGeom, new THREE.MeshBasicMaterial());
                iconHoleCutterBrush.scale.set(scale, -scale, 1);
                iconHoleCutterBrush.position.set(options.iconPosX, options.iconPosY, topZ);
                iconHoleCutterBrush.updateMatrixWorld();
            }
        } else if (lightShapes.length > 0) {
            // Fallback: If icon is only light shapes, treat them as the carving volume
            const scale = Math.max(0, options.width - options.iconMargin * 2) / 512;
            const lightMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const lightGeom = new THREE.ExtrudeGeometry(lightShapes, { depth: options.iconDepth + overlap, bevelEnabled: false, curveSegments: 6 });
            lightGeom.translate(-256, -256, -(options.iconDepth + overlap) / 2);
            iconCutterBrush = new Brush(lightGeom, lightMat);
            iconCutterBrush.scale.set(scale, -scale, 1);
            iconCutterBrush.position.set(options.iconPosX, options.iconPosY, topZ - options.iconDepth / 2);
            iconCutterBrush.updateMatrixWorld();
        }
    }

    // 4. Combined Boolean
    const safetyBrush = new Brush(new THREE.CylinderGeometry(radius + filletR, radius + filletR, options.height * 2, 32), new THREE.MeshBasicMaterial());
    safetyBrush.rotateX(Math.PI / 2);
    safetyBrush.updateMatrixWorld();

    evaluator.useGroups = true; // Use groups throughout to preserve visual contrast
    let masterCutter: Brush | null = null;
    
    if (iconCutterBrush) {
        if (textStrokeBrush) {
            iconCutterBrush = toBrush(evaluator.evaluate(iconCutterBrush, textStrokeBrush, SUBTRACTION));
        }
        masterCutter = iconCutterBrush;
    }
    
    // (B) Subtract Holes from the Icon Volume (so they remain as islands)
    if (iconHoleCutterBrush) {
        if (masterCutter) {
            masterCutter = toBrush(evaluator.evaluate(masterCutter, iconHoleCutterBrush, SUBTRACTION));
        } else {
            // If there's no iconCutterBrush, but there are holes, the holes themselves become the master cutter
            // This case is unlikely given the current logic where iconCutterBrush is usually present if iconHoleCutterBrush is.
            // However, if it were to happen, we'd treat the holes as the initial cutter.
            masterCutter = iconHoleCutterBrush;
        }
    }
    
    if (textCutterBrush) {
        masterCutter = masterCutter ? toBrush(evaluator.evaluate(masterCutter, textCutterBrush, ADDITION)) : textCutterBrush;
    }

    if (masterCutter) {
        evaluator.useGroups = true; // Use groups for final cut
        const clamped = evaluator.evaluate(masterCutter, safetyBrush, INTERSECTION);
        finalTokenMesh = evaluator.evaluate(toBrush(finalTokenMesh), toBrush(clamped), SUBTRACTION);
    }

    group.add(finalTokenMesh);
    return group;
}
