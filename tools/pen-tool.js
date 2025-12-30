/**
 * PenTool
 * Handles drawing polygons (click) and splines (click and drag)
 */
class PenTool {
    constructor(editor) {
        this.editor = editor;
        this.isDrawing = false;
        this.currentElement = null;
        this.points = [];
        this.currentPath = '';
        this.lastPoint = null;
        this.dragStart = null;
        this.isDragging = false;
        this.previewElement = null;
        this.polygonMode = true; // true for polygon, false for spline
        this.lastSplinePoint = null;
    }

    onMouseDown(e, element) {
        // Don't start drawing if clicking on an existing drawable element
        // Allow clicks on the SVG element itself (empty canvas) or elements that aren't drawable shapes
        if (element && element !== this.editor.svgElement && 
            (element.tagName === 'path' || element.tagName === 'circle' || 
             element.tagName === 'rect' || element.tagName === 'ellipse' || 
             element.tagName === 'line' || element.tagName === 'polyline' || 
             element.tagName === 'polygon')) {
            return false;
        }

        // Convert mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Store drag start position
        this.dragStart = { x: svgPoint.x, y: svgPoint.y };
        this.isDragging = false;
        this.lastPoint = svgPoint;
        this.lastSplinePoint = null;

        // Start drawing if not already drawing
        if (!this.isDrawing) {
            this.startDrawing(svgPoint);
        }

        return true; // Handled
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.dragStart) {
            return false;
        }

        // Convert mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Check if we're dragging (moved more than threshold)
        const moveThreshold = 3;
        const movedX = Math.abs(svgPoint.x - this.dragStart.x);
        const movedY = Math.abs(svgPoint.y - this.dragStart.y);
        const isCurrentlyDragging = movedX > moveThreshold || movedY > moveThreshold;

        if (isCurrentlyDragging && !this.isDragging) {
            // Just started dragging - switch to spline mode
            this.isDragging = true;
            this.polygonMode = false;
            
            // Start spline from the first point (which was set in startDrawing)
            if (this.points.length > 0) {
                const firstPoint = this.points[0];
                this.currentPath = `M ${firstPoint.x} ${firstPoint.y}`;
                this.lastSplinePoint = firstPoint;
                // Add first point to points if not already there (it should be)
            }
        }

        if (this.isDragging) {
            // Continuously add points to spline while dragging
            // Only add point if moved enough from last point (to avoid too many points)
            if (this.lastSplinePoint) {
                const distance = Math.sqrt(
                    Math.pow(svgPoint.x - this.lastSplinePoint.x, 2) + 
                    Math.pow(svgPoint.y - this.lastSplinePoint.y, 2)
                );
                const minDistance = 5; // Minimum distance between spline points
                if (distance >= minDistance) {
                    this.addSplinePointWhileDragging(svgPoint);
                    this.lastSplinePoint = svgPoint;
                }
            }
        }

        // Update preview
        this.updatePreview(svgPoint);

        return true; // Handled
    }

    onMouseUp(e) {
        if (!this.isDrawing) {
            return false;
        }

        // Convert mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        if (this.isDragging) {
            // Finished dragging - finish the spline
            if (this.lastSplinePoint) {
                // Add final point if it's different from last point
                const distance = Math.sqrt(
                    Math.pow(svgPoint.x - this.lastSplinePoint.x, 2) + 
                    Math.pow(svgPoint.y - this.lastSplinePoint.y, 2)
                );
                if (distance >= 1) {
                    this.addSplinePointWhileDragging(svgPoint);
                }
            }
            // Finish the spline drawing
            this.finishDrawing(false);
        } else {
            // It was a click (not a drag) - add point to polygon
            this.polygonMode = true;
            
            // Check if clicking close to first point (close the polygon)
            // Only check if we have at least 2 points (start point + at least one more)
            if (this.points.length >= 2) {
                const firstPoint = this.points[0];
                const distance = Math.sqrt(
                    Math.pow(svgPoint.x - firstPoint.x, 2) + 
                    Math.pow(svgPoint.y - firstPoint.y, 2)
                );
                const closeThreshold = 10; // pixels
                
                if (distance < closeThreshold) {
                    // Close the polygon
                    this.finishDrawing(true);
                    return true;
                }
            }
            
            // Add point for polygon (avoid duplicates if clicking same spot)
            const lastPoint = this.points[this.points.length - 1];
            const distance = Math.sqrt(
                Math.pow(svgPoint.x - lastPoint.x, 2) + 
                Math.pow(svgPoint.y - lastPoint.y, 2)
            );
            if (distance > 1) {
                this.addPoint(svgPoint, false);
            }
        }

        this.dragStart = null;
        this.isDragging = false;
        this.lastSplinePoint = null;
        return true; // Handled
    }

    onDoubleClick(e) {
        if (this.isDrawing) {
            this.finishDrawing(false);
            return true;
        }
        return false;
    }

    startDrawing(startPoint) {
        this.isDrawing = true;
        this.points = [startPoint];
        this.currentPath = '';
        this.polygonMode = true;

        // Create preview element
        this.createPreview();
    }

    addPoint(point, isSpline) {
        this.points.push(point);

        if (this.polygonMode || !isSpline) {
            // Polygon mode - create/update polygon element
            this.updatePolygonPreview();
        }
    }

    addSplinePointWhileDragging(point) {
        // Add point to spline while dragging
        if (this.currentPath === '') {
            // Start path from first point
            if (this.points.length > 0) {
                const firstPoint = this.points[0];
                this.currentPath = `M ${firstPoint.x} ${firstPoint.y}`;
            } else {
                this.currentPath = `M ${point.x} ${point.y}`;
                this.points.push(point);
                return;
            }
        }

        // Use last spline point or last point in points array
        const lastPoint = this.lastSplinePoint || this.points[this.points.length - 1];
        
        // Calculate control points for smooth curve
        // Use smooth bezier curve with control points positioned for natural flow
        const controlX1 = lastPoint.x + (point.x - lastPoint.x) * 0.3;
        const controlY1 = lastPoint.y + (point.y - lastPoint.y) * 0.3;
        const controlX2 = lastPoint.x + (point.x - lastPoint.x) * 0.7;
        const controlY2 = lastPoint.y + (point.y - lastPoint.y) * 0.7;

        // Add curve segment
        this.currentPath += ` C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${point.x} ${point.y}`;
        
        // Store point
        this.points.push(point);
        this.updateSplinePreview();
    }

    updatePreview(currentPoint) {
        if (this.polygonMode) {
            // For polygon, show preview line from last point to current point
            this.updatePolygonPreview(currentPoint);
        } else {
            // For spline, update the path preview
            this.updateSplinePreview(currentPoint);
        }
    }

    createPreview() {
        const svgNS = 'http://www.w3.org/2000/svg';
        
        // Remove old preview if exists
        if (this.previewElement) {
            this.previewElement.remove();
        }

        if (this.polygonMode) {
            // Create polygon element
            this.previewElement = document.createElementNS(svgNS, 'polygon');
            this.previewElement.setAttribute('fill', 'none');
            this.previewElement.setAttribute('stroke', '#0078d4');
            this.previewElement.setAttribute('stroke-width', '1');
            this.previewElement.setAttribute('stroke-dasharray', '4,4');
            this.previewElement.style.pointerEvents = 'none';
        } else {
            // Create path element
            this.previewElement = document.createElementNS(svgNS, 'path');
            this.previewElement.setAttribute('fill', 'none');
            this.previewElement.setAttribute('stroke', '#0078d4');
            this.previewElement.setAttribute('stroke-width', '1');
            this.previewElement.setAttribute('stroke-dasharray', '4,4');
            this.previewElement.style.pointerEvents = 'none';
        }

        // Add to SVG (before bounding box group so it's visible but not in the way)
        const bboxGroup = this.editor.svgElement.querySelector('#boundingBoxGroup');
        if (bboxGroup) {
            this.editor.svgElement.insertBefore(this.previewElement, bboxGroup);
        } else {
            this.editor.svgElement.appendChild(this.previewElement);
        }
    }

    updatePolygonPreview(currentPoint) {
        if (!this.previewElement || this.previewElement.tagName !== 'polygon') {
            this.createPreview();
        }

        if (this.points.length === 0) return;

        // Build points string
        let pointsStr = this.points.map(p => `${p.x},${p.y}`).join(' ');
        
        // Add current point if provided
        if (currentPoint) {
            pointsStr += ` ${currentPoint.x},${currentPoint.y}`;
        }

        this.previewElement.setAttribute('points', pointsStr);
    }

    updateSplinePreview(currentPoint) {
        if (!this.previewElement || this.previewElement.tagName !== 'path') {
            this.createPreview();
        }

        let previewPath = this.currentPath;
        
        // Add preview segment to current point (for live preview while dragging)
        if (currentPoint) {
            const lastPoint = this.lastSplinePoint || (this.points.length > 0 ? this.points[this.points.length - 1] : null);
            if (lastPoint) {
                const controlX1 = lastPoint.x + (currentPoint.x - lastPoint.x) * 0.3;
                const controlY1 = lastPoint.y + (currentPoint.y - lastPoint.y) * 0.3;
                const controlX2 = lastPoint.x + (currentPoint.x - lastPoint.x) * 0.7;
                const controlY2 = lastPoint.y + (currentPoint.y - lastPoint.y) * 0.7;
                previewPath += ` C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${currentPoint.x} ${currentPoint.y}`;
            }
        }

        this.previewElement.setAttribute('d', previewPath);
    }

    finishDrawing(closePath) {
        // For polygon, need at least 2 points; for spline, need at least path data
        if (!this.isDrawing) {
            this.cancelDrawing();
            return;
        }
        
        // For polygon mode, need at least 2 points
        if (this.polygonMode && this.points.length < 2) {
            this.cancelDrawing();
            return;
        }
        
        // For spline mode, need at least some path data
        if (!this.polygonMode && (!this.currentPath || this.currentPath.trim() === '' || this.currentPath.trim() === 'M')) {
            this.cancelDrawing();
            return;
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        let element;

        if (this.polygonMode) {
            // Create polygon element
            element = document.createElementNS(svgNS, 'polygon');
            
            let pointsStr = this.points.map(p => `${p.x},${p.y}`).join(' ');
            if (closePath && this.points.length >= 3) {
                // Already closed (points include first point)
                // Just use all points
            } else if (closePath) {
                // Need at least 3 points to close
                this.cancelDrawing();
                return;
            }
            
            element.setAttribute('points', pointsStr);
        } else {
            // Create path element for spline
            element = document.createElementNS(svgNS, 'path');
            
            if (this.currentPath === '' && this.points.length > 0) {
                this.currentPath = `M ${this.points[0].x} ${this.points[0].y}`;
                for (let i = 1; i < this.points.length; i++) {
                    const prev = this.points[i - 1];
                    const curr = this.points[i];
                    const controlX1 = prev.x + (curr.x - prev.x) * 0.3;
                    const controlY1 = prev.y + (curr.y - prev.y) * 0.3;
                    const controlX2 = prev.x + (curr.x - prev.x) * 0.7;
                    const controlY2 = prev.y + (curr.y - prev.y) * 0.7;
                    this.currentPath += ` C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${curr.x} ${curr.y}`;
                }
            }
            
            element.setAttribute('d', this.currentPath);
        }

        // Apply default styling
        element.setAttribute('fill', 'none');
        element.setAttribute('stroke', '#000000');
        element.setAttribute('stroke-width', '1');

        // Generate unique ID
        const id = `element-${Date.now()}`;
        element.id = id;

        // Add to SVG (before bounding box group)
        const bboxGroup = this.editor.svgElement.querySelector('#boundingBoxGroup');
        if (bboxGroup) {
            this.editor.svgElement.insertBefore(element, bboxGroup);
        } else {
            this.editor.svgElement.appendChild(element);
        }

        // Update layers
        this.editor.extractLayers();
        this.editor.renderLayersPanel();

        // Select the new element
        this.editor.selectElement(element, false);

        // Save history state
        this.editor.historyManager.saveState('Draw with pen tool');

        // Clean up
        this.cancelDrawing();
    }

    cancelDrawing() {
        if (this.previewElement) {
            this.previewElement.remove();
            this.previewElement = null;
        }
        this.isDrawing = false;
        this.points = [];
        this.currentPath = '';
        this.lastPoint = null;
        this.lastSplinePoint = null;
        this.dragStart = null;
        this.isDragging = false;
        this.polygonMode = true;
    }
}

