/**
 * MarqueeTool
 * Handles marquee selection (box selection) interactions
 */
class MarqueeTool {
    constructor(editor) {
        this.editor = editor;
        this.marqueeModeEnabled = false;
        this.isMarqueeSelecting = false;
        this.marqueeRect = null;
        this.marqueeStart = { x: 0, y: 0 };
        this.marqueeMultiSelect = false;
        this.justCompletedMarqueeSelection = false;
    }

    toggleMode() {
        this.marqueeModeEnabled = !this.marqueeModeEnabled;

        // Update UI
        const marqueeBtn = document.getElementById('marqueeSelectTool');
        if (marqueeBtn) {
            if (this.marqueeModeEnabled) {
                marqueeBtn.classList.add('active');
            } else {
                marqueeBtn.classList.remove('active');
            }
        }

        // Clear any active marquee selection when toggling
        if (this.isMarqueeSelecting) {
            this.endSelection();
        }
    }

    isEnabled() {
        return this.marqueeModeEnabled;
    }

    canStartOnElement(target) {
        // Don't start marquee if clicking directly on an element
        if (target && target !== this.editor.svgElement &&
            (target.tagName === 'path' || target.tagName === 'circle' ||
             target.tagName === 'rect' || target.tagName === 'ellipse' ||
             target.tagName === 'line' || target.tagName === 'polyline' ||
             target.tagName === 'polygon')) {
            return false;
        }
        return true;
    }

    startSelection(e) {
        if (!this.marqueeModeEnabled) return;
        if (!(this.editor.currentTool === 'select' || this.editor.currentTool === 'direct-select')) return;

        // Convert mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Store start position
        this.marqueeStart = {
            x: svgPoint.x,
            y: svgPoint.y
        };

        // Check if modifier keys are pressed (for multi-select)
        this.marqueeMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;

        // Create marquee group if it doesn't exist
        let marqueeGroup = this.editor.svgElement.querySelector('#marqueeSelectGroup');
        if (!marqueeGroup) {
            marqueeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            marqueeGroup.id = 'marqueeSelectGroup';
            marqueeGroup.style.pointerEvents = 'none';
            this.editor.svgElement.appendChild(marqueeGroup);
        }

        // Create marquee rectangle
        this.marqueeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.marqueeRect.setAttribute('x', this.marqueeStart.x);
        this.marqueeRect.setAttribute('y', this.marqueeStart.y);
        this.marqueeRect.setAttribute('width', '0');
        this.marqueeRect.setAttribute('height', '0');
        this.marqueeRect.setAttribute('fill', 'rgba(0, 120, 212, 0.1)');
        this.marqueeRect.setAttribute('stroke', '#0078d4');
        this.marqueeRect.setAttribute('stroke-width', '1');
        this.marqueeRect.setAttribute('stroke-dasharray', '4,4');
        marqueeGroup.appendChild(this.marqueeRect);

        this.isMarqueeSelecting = true;
    }

    updateSelection(e) {
        if (!this.editor.svgElement || !this.marqueeRect) return;

        // Convert current mouse position to SVG coordinates
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Calculate rectangle dimensions (can go in any direction)
        const x = Math.min(this.marqueeStart.x, svgPoint.x);
        const y = Math.min(this.marqueeStart.y, svgPoint.y);
        const width = Math.abs(svgPoint.x - this.marqueeStart.x);
        const height = Math.abs(svgPoint.y - this.marqueeStart.y);

        // Update rectangle attributes
        this.marqueeRect.setAttribute('x', x);
        this.marqueeRect.setAttribute('y', y);
        this.marqueeRect.setAttribute('width', width);
        this.marqueeRect.setAttribute('height', height);

        // Update transform to maintain constant screen size
        this.editor.updateTemporaryUIElementTransforms();
    }

    endSelection() {
        if (!this.isMarqueeSelecting) return;

        // Get the final marquee rectangle bounds before removing it
        // Check if marqueeRect still exists and is in the DOM
        if (!this.marqueeRect || !this.marqueeRect.parentNode) {
            // Rectangle was already removed, just reset state
            this.isMarqueeSelecting = false;
            this.marqueeRect = null;
            this.marqueeStart = { x: 0, y: 0 };
            this.marqueeMultiSelect = false;
            return;
        }

        // Get the final marquee rectangle bounds (already in SVG root coordinates)
        const marqueeX = parseFloat(this.marqueeRect.getAttribute('x'));
        const marqueeY = parseFloat(this.marqueeRect.getAttribute('y'));
        const marqueeWidth = parseFloat(this.marqueeRect.getAttribute('width'));
        const marqueeHeight = parseFloat(this.marqueeRect.getAttribute('height'));

        // Only select if the marquee rectangle has a valid size
        if (marqueeWidth > 0 && marqueeHeight > 0) {
            // Determine drag direction: left-to-right if end x > start x, right-to-left otherwise
            const isLeftToRight = marqueeX >= this.marqueeStart.x;

            if (this.editor.currentTool === 'direct-select') {
                // Direct-select mode: select nodes from currently selected paths
                this.editor.selectNodesInMarquee(marqueeX, marqueeY, marqueeWidth, marqueeHeight);
            } else {
                // Select mode: select paths/elements
                // Pass drag direction: true for left-to-right (containment), false for right-to-left (intersection)
                this.editor.selectElementsInMarquee(marqueeX, marqueeY, marqueeWidth, marqueeHeight, isLeftToRight);
            }
        }

        // Remove the marquee rectangle
        const marqueeGroup = this.editor.svgElement.querySelector('#marqueeSelectGroup');
        if (marqueeGroup) {
            marqueeGroup.remove();
        }

        // Set flag to prevent click handler from interfering (must be set before resetting isMarqueeSelecting)
        this.justCompletedMarqueeSelection = true;

        // Reset state
        this.isMarqueeSelecting = false;
        this.marqueeRect = null;
        this.marqueeStart = { x: 0, y: 0 };
        this.marqueeMultiSelect = false;
    }
}


