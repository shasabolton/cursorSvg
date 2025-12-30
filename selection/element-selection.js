/**
 * ElementSelectionManager
 * Manages element selection state and operations
 */
class ElementSelectionManager {
    constructor(editor) {
        this.editor = editor;
        this.selectedElements = new Set();
    }

    selectElement(element, multiSelect = false) {
        if (!element) return;

        if (!multiSelect) {
            this.clearSelection();
        }

        if (this.selectedElements.has(element)) {
            this.selectedElements.delete(element);
            element.classList.remove('selected');
        } else {
            this.selectedElements.add(element);
            element.classList.add('selected');
        }

        // Update last selected layer index if this element corresponds to a layer and is selected
        const layerIndex = this.editor.layers.findIndex(layer => layer.element === element);
        if (layerIndex !== -1 && this.selectedElements.has(element)) {
            this.editor.lastSelectedLayerIndex = layerIndex;
        }

        // Force a reflow to ensure the class is applied
        element.offsetHeight;

        // Update control panel when selection changes
        this.editor.updateControlPanel();

        // Update transform panel when selection changes
        this.editor.updateTransformPanel();

        // Update bounding box
        this.editor.updateBoundingBox();
    }

    clearSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove('selected');
        });
        this.selectedElements.clear();
        this.editor.clearNodeSelection();
        this.editor.clearNodeHandles();
        this.editor.lastSelectedLayerIndex = null; // Reset last selected layer index
        this.editor.updateControlPanel();
        this.editor.updateTransformPanel();
        this.editor.updateBoundingBox();
    }

    selectElementsInMarquee(marqueeX, marqueeY, marqueeWidth, marqueeHeight, isLeftToRight = true) {
        // Get all selectable elements
        const allElements = this.editor.svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon');

        // Clear current selection only if not using modifier keys (add to selection)
        if (!this.editor.marqueeMultiSelect) {
            this.clearSelection();
        }

        // Collect elements based on drag direction
        const elementsToSelect = [];
        allElements.forEach(element => {
            // Skip elements that are in the bounding box or marquee groups
            if (element.closest && (element.closest('#boundingBoxGroup') || element.closest('#marqueeSelectGroup'))) {
                return;
            }

            try {
                // Get element's bounding box
                const bbox = element.getBBox();

                // Convert all four corners of the element's bounding box to root coordinates
                const corners = [
                    { x: bbox.x, y: bbox.y }, // top-left
                    { x: bbox.x + bbox.width, y: bbox.y }, // top-right
                    { x: bbox.x + bbox.width, y: bbox.y + bbox.height }, // bottom-right
                    { x: bbox.x, y: bbox.y + bbox.height } // bottom-left
                ];

                // Convert corners to root coordinates
                const rootCorners = corners.map(corner => this.editor.toRootCoords(element, corner.x, corner.y));

                // Find bounding box in root coordinates
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                rootCorners.forEach(corner => {
                    minX = Math.min(minX, corner.x);
                    minY = Math.min(minY, corner.y);
                    maxX = Math.max(maxX, corner.x);
                    maxY = Math.max(maxY, corner.y);
                });

                const elementWidth = maxX - minX;
                const elementHeight = maxY - minY;

                let shouldSelect = false;

                if (isLeftToRight) {
                    // Left-to-right: only select elements completely inside the marquee box
                    // Element is completely inside if all corners are within the marquee rectangle
                    shouldSelect = (minX >= marqueeX &&
                                   maxX <= marqueeX + marqueeWidth &&
                                   minY >= marqueeY &&
                                   maxY <= marqueeY + marqueeHeight);
                } else {
                    // Right-to-left: select elements that intersect with the marquee box
                    // Rectangle intersection check
                    shouldSelect = (minX < marqueeX + marqueeWidth &&
                                  minX + elementWidth > marqueeX &&
                                  minY < marqueeY + marqueeHeight &&
                                  minY + elementHeight > marqueeY);
                }

                if (shouldSelect) {
                    elementsToSelect.push(element);
                }
            } catch (e) {
                // Skip elements that don't support getBBox or have other errors
            }
        });

        // Now select all collected elements
        elementsToSelect.forEach(element => {
            // selectElement handles both cases:
            // - With modifier keys: toggles selection (multiSelect=true)
            // - Without modifier keys: adds to selection (multiSelect=true, but selection was already cleared)
            this.selectElement(element, true);
        });

        // Update layers panel after selection
        this.editor.renderLayersPanel();
    }
}

