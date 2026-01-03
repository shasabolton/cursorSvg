/**
 * BoundingBoxManager
 * Manages bounding box display and transform handles for selected elements
 */
class BoundingBoxManager {
    constructor(editor) {
        this.editor = editor;
        this.boundingBoxOverlay = null;
        this.boundingBox = null;
        this.isTransforming = false;
        this.transformHandle = null;
        this.transformStart = { x: 0, y: 0 };
        this.transformStartBBox = null;
        this.transformStartStates = new Map();
        this.transformStartCenters = new Map(); // Store center in element-local coords
        this.transformStartElementData = new Map(); // Store original element data for scaling
    }

    create() {
        if (!this.editor.svgElement) return;

        // Create a group inside the SVG for the bounding box
        // This ensures it's positioned correctly and doesn't block other elements
        const bboxGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        bboxGroup.id = 'boundingBoxGroup';
        bboxGroup.setAttribute('class', 'bounding-box-group');
        bboxGroup.style.pointerEvents = 'none';

        // Append to SVG (at the end so it's on top)
        this.editor.svgElement.appendChild(bboxGroup);

        this.boundingBoxOverlay = bboxGroup;
    }

    update() {
        if (!this.boundingBoxOverlay || !this.editor.svgElement) return;

        // Clear existing bounding box
        this.boundingBoxOverlay.innerHTML = '';

        if (this.editor.selectedElements.size === 0) {
            return;
        }

        // Calculate combined bounding box in SVG root coordinates
        // Convert each element's bounding box corners to root coordinates (like node handles do)
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        this.editor.selectedElements.forEach(element => {
            try {
                const bbox = element.getBBox();
                // Get all four corners of the bounding box
                const corners = [
                    { x: bbox.x, y: bbox.y }, // top-left
                    { x: bbox.x + bbox.width, y: bbox.y }, // top-right
                    { x: bbox.x + bbox.width, y: bbox.y + bbox.height }, // bottom-right
                    { x: bbox.x, y: bbox.y + bbox.height } // bottom-left
                ];

                // Convert each corner to root SVG coordinates (same as node handles)
                corners.forEach(corner => {
                    const rootCoords = this.editor.toRootCoords(element, corner.x, corner.y);
                    minX = Math.min(minX, rootCoords.x);
                    minY = Math.min(minY, rootCoords.y);
                    maxX = Math.max(maxX, rootCoords.x);
                    maxY = Math.max(maxY, rootCoords.y);
                });
            } catch (e) {
                // Skip elements that don't support getBBox
            }
        });

        if (minX === Infinity || minY === Infinity) return;

        // Store bounding box info in SVG root coordinates
        this.boundingBox = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        // Position and size of bounding box in SVG root coordinates
        const padding = 10;
        const x = this.boundingBox.x;
        const y = this.boundingBox.y;
        const width = this.boundingBox.width;
        const height = this.boundingBox.height;

        // Set pointer events on the group - allow events on handles only
        this.boundingBoxOverlay.style.pointerEvents = 'none';

        // Create bounding box rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - padding);
        rect.setAttribute('y', y - padding);
        rect.setAttribute('width', width + padding * 2);
        rect.setAttribute('height', height + padding * 2);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#0078d4');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '5,5');
        rect.setAttribute('class', 'bounding-box');
        this.boundingBoxOverlay.appendChild(rect);

        // Transform center is calculated from boundingBox when needed

        // Create resize handles (8 handles: corners and edges)
        const handlePositions = [
            { x: x - padding, y: y - padding, cursor: 'nw-resize', type: 'nw' }, // top-left
            { x: x + width / 2, y: y - padding, cursor: 'n-resize', type: 'n' }, // top
            { x: x + width + padding, y: y - padding, cursor: 'ne-resize', type: 'ne' }, // top-right
            { x: x + width + padding, y: y + height / 2, cursor: 'e-resize', type: 'e' }, // right
            { x: x + width + padding, y: y + height + padding, cursor: 'se-resize', type: 'se' }, // bottom-right
            { x: x + width / 2, y: y + height + padding, cursor: 's-resize', type: 's' }, // bottom
            { x: x - padding, y: y + height + padding, cursor: 'sw-resize', type: 'sw' }, // bottom-left
            { x: x - padding, y: y + height / 2, cursor: 'w-resize', type: 'w' } // left
        ];

        handlePositions.forEach(pos => {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            handle.setAttribute('cx', pos.x);
            handle.setAttribute('cy', pos.y);
            handle.setAttribute('r', '6');
            handle.setAttribute('fill', '#ffffff');
            handle.setAttribute('stroke', '#0078d4');
            handle.setAttribute('stroke-width', '2');
            handle.setAttribute('class', 'bbox-handle');
            handle.setAttribute('data-type', pos.type);
            handle.setAttribute('data-handle-type', pos.type);
            handle.style.pointerEvents = 'all';
            handle.style.cursor = pos.cursor;
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.handleHandleDown(e, pos.type);
            });
            this.boundingBoxOverlay.appendChild(handle);
        });

        // Create rotation handle (above the bounding box)
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        const rotationHandleY = y - padding - 30;
        const rotationHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        rotationHandle.setAttribute('cx', centerX);
        rotationHandle.setAttribute('cy', rotationHandleY);
        rotationHandle.setAttribute('r', '6');
        rotationHandle.setAttribute('fill', '#ffffff');
        rotationHandle.setAttribute('stroke', '#ff4081');
        rotationHandle.setAttribute('stroke-width', '2');
        rotationHandle.setAttribute('class', 'bbox-rotation-handle');
        rotationHandle.style.pointerEvents = 'all';
        rotationHandle.style.cursor = 'crosshair';
        rotationHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.handleHandleDown(e, 'rotate');
        });
        this.boundingBoxOverlay.appendChild(rotationHandle);

        // Draw line from center to rotation handle
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', centerX);
        line.setAttribute('y1', centerY);
        line.setAttribute('x2', centerX);
        line.setAttribute('y2', rotationHandleY);
        line.setAttribute('stroke', '#ff4081');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '3,3');
        this.boundingBoxOverlay.appendChild(line);

        // Apply inverse scale transform to maintain constant screen size
        this.editor.updateTemporaryUIElementTransforms();
    }

    handleHandleDown(e, handleType) {
        if (this.editor.currentTool !== 'select' || this.editor.selectedElements.size === 0) return;

        e.stopPropagation();
        e.preventDefault();

        this.isTransforming = true;
        this.transformHandle = handleType;

        // Store initial mouse position and bounding box
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        this.transformStart = {
            x: svgPoint.x,
            y: svgPoint.y
        };

        this.transformStartBBox = { ...this.boundingBox };

        // Store initial transforms for each element to calculate deltas
        this.transformStartStates = new Map();
        this.transformStartCenters = new Map(); // Store center in element-local coordinates

        // Calculate transform center in root coordinates
        const centerRootX = this.transformStartBBox.x + this.transformStartBBox.width / 2;
        const centerRootY = this.transformStartBBox.y + this.transformStartBBox.height / 2;

        this.editor.selectedElements.forEach(element => {
            this.transformStartStates.set(element, this.editor.getElementTransform(element));

            // Store original element data for coordinate-level scaling
            // This prevents scaling from compounding on each mouse move
            this.transformStartElementData.set(element, this.editor.saveElementData(element));

            // Get the center point in element's local (untransformed) coordinate space
            // Use getBBox() which returns coordinates in the element's local space
            try {
                const bbox = element.getBBox();
                const centerLocal = {
                    x: bbox.x + bbox.width / 2,
                    y: bbox.y + bbox.height / 2
                };
                this.transformStartCenters.set(element, centerLocal);
            } catch (e) {
                // Fallback if getBBox fails
                this.transformStartCenters.set(element, { x: centerRootX, y: centerRootY });
            }
        });
    }

    handleTransform(e) {
        if (!this.isTransforming || !this.transformHandle || !this.boundingBox) return;

        // Convert mouse position to SVG root coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Transform center in root SVG coordinates
        const centerRootX = this.transformStartBBox.x + this.transformStartBBox.width / 2;
        const centerRootY = this.transformStartBBox.y + this.transformStartBBox.height / 2;

        if (this.transformHandle === 'rotate') {
            // Calculate rotation angle
            const dx = svgPoint.x - centerRootX;
            const dy = svgPoint.y - centerRootY;
            const startDx = this.transformStart.x - centerRootX;
            const startDy = this.transformStart.y - centerRootY;

            const angle = Math.atan2(dy, dx) - Math.atan2(startDy, startDx);
            const angleDeg = angle * (180 / Math.PI);

            // Apply rotation to all selected elements
            this.editor.selectedElements.forEach(element => {
                // Use the stored center point in element-local coordinates (untransformed)
                const centerLocal = this.transformStartCenters.get(element) || { x: centerRootX, y: centerRootY };

                // Get initial transform state
                const initialTransform = this.transformStartStates.get(element) || {};
                const initialRotation = initialTransform.rotation || 0;

                // Calculate new rotation relative to initial state
                const newRotation = initialRotation + angleDeg;

                // Get other transform values to preserve them
                const currentTransform = this.editor.getElementTransform(element);

                // Apply rotation about the center point (in element-local coords)
                this.editor.setElementTransform(element, {
                    x: currentTransform.x,
                    y: currentTransform.y,
                    rotation: newRotation,
                    rotationCenterX: centerLocal.x,
                    rotationCenterY: centerLocal.y,
                    scaleX: currentTransform.scaleX,
                    scaleY: currentTransform.scaleY,
                    scaleCenterX: currentTransform.scaleCenterX,
                    scaleCenterY: currentTransform.scaleCenterY
                });
            });
        } else {
            // Handle scaling
            // Calculate scale factors based on handle type
            let scaleX = 1;
            let scaleY = 1;

            // Determine which direction to scale based on handle
            const handles = {
                'nw': { x: -1, y: -1 },
                'n': { x: 0, y: -1 },
                'ne': { x: 1, y: -1 },
                'e': { x: 1, y: 0 },
                'se': { x: 1, y: 1 },
                's': { x: 0, y: 1 },
                'sw': { x: -1, y: 1 },
                'w': { x: -1, y: 0 }
            };

            const handle = handles[this.transformHandle];
            if (handle) {
                // Calculate distance from center in SVG coordinates (not absolute, preserve direction)
                // Use the same coordinate conversion as direct select node dragging
                const startDx = this.transformStart.x - centerRootX;
                const startDy = this.transformStart.y - centerRootY;

                const currentDx = svgPoint.x - centerRootX;
                const currentDy = svgPoint.y - centerRootY;

                // Calculate scale factors based on handle direction
                // For each axis, only scale if the handle controls that axis
                if (handle.x !== 0 && Math.abs(startDx) > 0.001) {
                    scaleX = currentDx / startDx;
                }
                if (handle.y !== 0 && Math.abs(startDy) > 0.001) {
                    scaleY = currentDy / startDy;
                }

                // Ensure scale is always positive (take absolute value)
                if (handle.x !== 0) {
                    scaleX = Math.abs(scaleX);
                }
                if (handle.y !== 0) {
                    scaleY = Math.abs(scaleY);
                }

                // Maintain aspect ratio for corner handles (Shift key)
                if (e.shiftKey && handle.x !== 0 && handle.y !== 0) {
                    scaleX = scaleY = Math.max(scaleX, scaleY);
                }
            }

            // Check if we should scale about each element's own center or selection center
            const scaleAboutOwnCenterCheckbox = document.getElementById('scaleAboutOwnCenter');
            const scaleAboutOwnCenter = scaleAboutOwnCenterCheckbox ? scaleAboutOwnCenterCheckbox.checked : false;

            // Get selection center in root coordinates (if not scaling about own center)
            // Use the transform start bounding box center for consistency
            const selectionCenterRoot = scaleAboutOwnCenter || this.editor.selectedElements.size === 1 ? null : {
                x: this.transformStartBBox.x + this.transformStartBBox.width / 2,
                y: this.transformStartBBox.y + this.transformStartBBox.height / 2
            };

            // Apply scaling to all selected elements using coordinate-level scaling
            // This uses the same function as the transform panel input
            this.editor.selectedElements.forEach(element => {
                // Restore to original state before scaling to prevent compounding
                const originalData = this.transformStartElementData.get(element);
                if (originalData) {
                    this.editor.restoreElementData(element, originalData);
                }

                // Get the center point in element's local coordinates
                let centerLocal;

                if (scaleAboutOwnCenter || !selectionCenterRoot) {
                    // Use the stored center point in element-local coordinates (from original state)
                    centerLocal = this.transformStartCenters.get(element);

                    if (!centerLocal) {
                        // Fallback: get center from current bounding box
                        try {
                            const bbox = element.getBBox();
                            centerLocal = {
                                x: bbox.x + bbox.width / 2,
                                y: bbox.y + bbox.height / 2
                            };
                        } catch (e) {
                            // Skip this element if we can't get its bbox
                            return;
                        }
                    }
                } else {
                    // Convert selection center from root coordinates to this element's local coordinates
                    // Need to convert using the original state (before any transforms)
                    const centerLocalFromRoot = this.editor.toLocalCoords(element, selectionCenterRoot.x, selectionCenterRoot.y);
                    centerLocal = centerLocalFromRoot;
                }

                // Use the coordinate-level scaling function (same as transform panel)
                // This preserves existing transforms and scales coordinates directly
                // Scale from original state, not from current (already scaled) state
                this.editor.scaleElementCoordinates(element, centerLocal.x, centerLocal.y, scaleX, scaleY);
            });
        }

        // Update bounding box display
        this.update();
        this.editor.updateTransformPanel();
    }

    endTransform() {
        this.isTransforming = false;
        this.transformHandle = null;
    }

    updateTransforms() {
        // Update bounding box stroke-width and handles (but not the group transform)
        if (this.boundingBoxOverlay) {
            const inverseScale = 1 / this.editor.zoomLevel;
            
            // Remove any group transform
            this.boundingBoxOverlay.removeAttribute('transform');

            // Update stroke-width of bounding box rectangle
            const bboxRect = this.boundingBoxOverlay.querySelector('.bounding-box');
            if (bboxRect) {
                const baseStrokeWidth = 2;
                bboxRect.setAttribute('stroke-width', baseStrokeWidth * inverseScale);
                // Also scale the dash array
                const baseDashArray = '5,5';
                const dashValues = baseDashArray.split(',').map(v => parseFloat(v.trim()) * inverseScale);
                bboxRect.setAttribute('stroke-dasharray', dashValues.join(','));
            }

            // Update bounding box handles (resize handles and rotation handle)
            const handles = this.boundingBoxOverlay.querySelectorAll('.bbox-handle, .bbox-rotation-handle');
            handles.forEach(handle => {
                const cx = parseFloat(handle.getAttribute('cx')) || 0;
                const cy = parseFloat(handle.getAttribute('cy')) || 0;
                // Keep radius at base value (transform will scale it)
                const baseR = 6;
                const baseStrokeWidth = 2;
                handle.setAttribute('r', baseR);
                handle.setAttribute('stroke-width', baseStrokeWidth);
                // Apply transform to keep handle at constant screen size
                handle.setAttribute('transform', `translate(${cx}, ${cy}) scale(${inverseScale}) translate(${-cx}, ${-cy})`);
            });

            // Update rotation line stroke-width
            const rotationLine = this.boundingBoxOverlay.querySelector('line');
            if (rotationLine) {
                const baseStrokeWidth = 1;
                rotationLine.setAttribute('stroke-width', baseStrokeWidth * inverseScale);
                // Also scale the dash array
                const baseDashArray = '3,3';
                const dashValues = baseDashArray.split(',').map(v => parseFloat(v.trim()) * inverseScale);
                rotationLine.setAttribute('stroke-dasharray', dashValues.join(','));
            }
        }
    }
}


