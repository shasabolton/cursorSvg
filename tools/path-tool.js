/**
 * PathTool
 * Handles drawing SVG paths with points and Bezier curves
 * - Clicking adds points to the path (straight line segments)
 * - Clicking and dragging adds a point at mouse down location and a control point at current mouse location
 * - Control point gets fixed on mouse up
 */
class PathTool {
    constructor(editor) {
        this.editor = editor;
        this.isDrawing = false;
        this.currentElement = null;
        this.pathData = '';
        this.points = [];
        this.dragStart = null;
        this.isDragging = false;
        this.currentControlPoint = null;
        this.previewElement = null;
        this.lastPoint = null;
        this.pendingPoint = null;
    }

    onMouseDown(e, element) {
        // Don't start drawing if clicking on an existing drawable element
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

        // Store drag start position (this is where the point will be added)
        this.dragStart = { x: svgPoint.x, y: svgPoint.y };
        this.isDragging = false;
        this.pendingPoint = svgPoint; // Store the point to be added

        // Start drawing if not already drawing
        if (!this.isDrawing) {
            this.startDrawing(svgPoint);
            this.pendingPoint = null; // Point already added
        }

        return true; // Handled
    }
    
    point180(origin, point) {
        point.x = origin.x - (point.x-origin.x);
        point.y = origin.y - (point.y-origin.y);
        return point;
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
        svgPoint = this.point180(this.pendingPoint, svgPoint);
        // Check if we're dragging (moved more than threshold)
        const moveThreshold = 3;
        const movedX = Math.abs(svgPoint.x - this.dragStart.x);
        const movedY = Math.abs(svgPoint.y - this.dragStart.y);
        const isCurrentlyDragging = movedX > moveThreshold || movedY > moveThreshold;

        if (isCurrentlyDragging && !this.isDragging) {
            // Just started dragging - add point at drag start and create curve with control point
            this.isDragging = true;
            if (this.pendingPoint) {
                // Add the point at mouse down location and create curve with current control point
                this.addPointForCurve(this.pendingPoint, svgPoint);
                this.pendingPoint = null;
            }
        }

        if (this.isDragging) {
            // Update control point while dragging
            this.updateLastSegmentToCurve(svgPoint);
            this.updatePreview(svgPoint);
        } else {
            // Not dragging yet - show preview line to pending point or current position
            const previewPoint = this.pendingPoint || svgPoint;
            this.updatePreview(previewPoint);
        }

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
            // Finished dragging - fix the control point at current mouse position
            this.currentControlPoint = svgPoint;
            this.finalizeCurveSegment();
        } else {
            // It was a click (not a drag) - add straight line point
            if (this.pendingPoint) {
                this.addPoint(this.pendingPoint);
                this.pendingPoint = null;
            }
            this.updatePreview();
        }

        this.dragStart = null;
        this.isDragging = false;
        this.currentControlPoint = null;
        return true; // Handled
    }

    onDoubleClick(e) {
        if (this.isDrawing) {
            this.finishDrawing();
            return true;
        }
        return false;
    }

    startDrawing(startPoint) {
        this.isDrawing = true;
        this.pathData = `M ${startPoint.x} ${startPoint.y}`;
        this.points = [startPoint];
        this.lastPoint = startPoint;

        // Create preview element
        this.createPreview();
    }

    addPoint(point) {
        // Add a straight line point
        if (this.pathData === '') {
            this.pathData = `M ${point.x} ${point.y}`;
        } else {
            this.pathData += ` L ${point.x} ${point.y}`;
        }
        
        this.points.push(point);
        this.lastPoint = point;
        this.updatePreview();
    }

    addPointForCurve(endPoint, controlPoint) {
        // Add a point that will be part of a curve
        // The curve goes from lastPoint -> controlPoint -> endPoint
        this.points.push(endPoint);
        this.lastPoint = endPoint;
        
        // Add quadratic curve: Q controlX controlY endX endY
        this.pathData += ` Q ${controlPoint.x} ${controlPoint.y} ${endPoint.x} ${endPoint.y}`;
        
        this.currentControlPoint = controlPoint;
    }

    updateLastSegmentToCurve(controlPoint) {
        // Update the last Q command with a new control point
        // The end point is the last point in the points array
        if (this.points.length > 0) {
            const endPoint = this.points[this.points.length - 1];
            
            // Replace the last Q command with updated control point
            this.pathData = this.pathData.replace(
                /\s+Q\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+$/,
                ` Q ${controlPoint.x} ${controlPoint.y} ${endPoint.x} ${endPoint.y}`
            );
            
            this.currentControlPoint = controlPoint;
        }
    }

    finalizeCurveSegment() {
        // Finalize the curve segment with the fixed control point
        // The curve is already in the path data, just need to update it with final control point
        if (this.currentControlPoint && this.points.length > 0) {
            const endPoint = this.points[this.points.length - 1];
            
            // Update the last Q command with the final control point
            this.pathData = this.pathData.replace(
                /\s+Q\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+$/,
                ` Q ${this.currentControlPoint.x} ${this.currentControlPoint.y} ${endPoint.x} ${endPoint.y}`
            );
        }
        this.updatePreview();
    }

    updatePreview(currentPoint) {
        if (!this.previewElement) {
            this.createPreview();
        }

        let previewPath = this.pathData;
        
        // If dragging, show preview of current curve
        if (this.isDragging && this.currentControlPoint && this.points.length >= 2) {
            const prevPoint = this.points[this.points.length - 2];
            const endPoint = this.points[this.points.length - 1];
            
            // Remove any existing Q command for this segment
            previewPath = previewPath.replace(/\s+Q\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+$/, '');
            
            // Add preview curve with current control point
            previewPath += ` Q ${this.currentControlPoint.x} ${this.currentControlPoint.y} ${endPoint.x} ${endPoint.y}`;
        } else if (currentPoint && !this.isDragging) {
            // Show preview line to current point
            previewPath += ` L ${currentPoint.x} ${currentPoint.y}`;
        }

        this.previewElement.setAttribute('d', previewPath);
    }

    createPreview() {
        const svgNS = 'http://www.w3.org/2000/svg';
        
        // Remove old preview if exists
        if (this.previewElement) {
            this.previewElement.remove();
        }

        // Create path element
        this.previewElement = document.createElementNS(svgNS, 'path');
        this.previewElement.setAttribute('fill', 'none');
        this.previewElement.setAttribute('stroke', '#0078d4');
        this.previewElement.setAttribute('stroke-width', '1');
        this.previewElement.setAttribute('stroke-dasharray', '4,4');
        this.previewElement.style.pointerEvents = 'none';

        // Add to SVG (before bounding box group so it's visible but not in the way)
        const bboxGroup = this.editor.svgElement.querySelector('#boundingBoxGroup');
        if (bboxGroup) {
            this.editor.svgElement.insertBefore(this.previewElement, bboxGroup);
        } else {
            this.editor.svgElement.appendChild(this.previewElement);
        }
    }

    finishDrawing() {
        // Need at least a move command
        if (!this.isDrawing || !this.pathData || this.pathData.trim() === '' || this.pathData.trim() === 'M') {
            this.cancelDrawing();
            return;
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        const element = document.createElementNS(svgNS, 'path');
        
        element.setAttribute('d', this.pathData);

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
        this.editor.historyManager.saveState('Draw with path tool');

        // Clean up
        this.cancelDrawing();
    }

    cancelDrawing() {
        if (this.previewElement) {
            this.previewElement.remove();
            this.previewElement = null;
        }
        this.isDrawing = false;
        this.pathData = '';
        this.points = [];
        this.lastPoint = null;
        this.dragStart = null;
        this.isDragging = false;
        this.currentControlPoint = null;
        this.pendingPoint = null;
    }
}

