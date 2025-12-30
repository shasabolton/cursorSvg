/**
 * SelectTool
 * Handles mouse interactions for the select tool
 */
class SelectTool {
    constructor(editor) {
        this.editor = editor;
    }

    onMouseDown(e, element) {
        // Only allow dragging if the element is already selected
        if (!this.editor.selectedElements.has(element)) {
            // Element is not selected, don't allow dragging
            return false; // Don't handle this event
        }

        // Don't select yet - wait for mouseup
        // But prepare for dragging
        this.editor.isDragging = true;
        this.editor.currentDraggedElement = element;

        // Convert initial mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Store initial click position in SVG coordinates
        this.editor.dragStart = {
            x: svgPoint.x,
            y: svgPoint.y
        };

        // Store initial transforms of all selected elements
        this.editor.selectedElementsInitialTransforms.clear();
        if (this.editor.selectedElements.size > 1) {
            // Store transforms for all selected elements
            this.editor.selectedElements.forEach(selectedEl => {
                const transform = this.editor.getElementTransform(selectedEl);
                this.editor.selectedElementsInitialTransforms.set(selectedEl, transform);
            });
        } else {
            // Store transform for just the dragged element (only one selected)
            const transform = this.editor.getElementTransform(element);
            this.editor.selectedElementsInitialTransforms.set(element, transform);
        }

        // Store initial element translate transform for the dragged element (for compatibility)
        const draggedElementTransform = this.editor.selectedElementsInitialTransforms.get(element);
        this.editor.dragOffset = {
            x: draggedElementTransform.x,
            y: draggedElementTransform.y
        };

        element.classList.add('dragging');
        return true; // Handled
    }

    onMouseMove(e) {
        if (!this.editor.isDragging || !this.editor.currentDraggedElement) {
            return false;
        }

        // Check if we've moved enough to consider it a drag
        const moveThreshold = 3;
        const movedX = Math.abs(e.clientX - this.editor.dragStartPos.x);
        const movedY = Math.abs(e.clientY - this.editor.dragStartPos.y);

        if (movedX > moveThreshold || movedY > moveThreshold) {
            this.editor.wasDragging = true;
        }

        // Convert current mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Calculate delta from initial click position
        const deltaX = svgPoint.x - this.editor.dragStart.x;
        const deltaY = svgPoint.y - this.editor.dragStart.y;

        // Move all selected elements by the same delta
        this.editor.selectedElementsInitialTransforms.forEach((initialTransform, el) => {
            this.editor.moveElement(el,
                initialTransform.x + deltaX,
                initialTransform.y + deltaY);
        });

        // Update bounding box during drag
        this.editor.updateBoundingBox();
        return true; // Handled
    }

    onMouseUp(e) {
        // Cleanup is handled in main handleMouseUp
        return false;
    }
}

