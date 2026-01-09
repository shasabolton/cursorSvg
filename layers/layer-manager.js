/**
 * LayerManager
 * Manages layer extraction, rendering, and layer panel interactions
 */
class LayerManager {
    constructor(editor) {
        this.editor = editor;
        this.layers = [];
        this.lastSelectedLayerIndex = null; // Track last selected layer for range selection
    }

    extract() {
        this.layers = [];
        if (!this.editor.svgElement) return;

        const elements = this.editor.svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, g');

        elements.forEach((el, index) => {
            // Skip bounding box group
            if (el.id === 'boundingBoxGroup') return;

            // Skip groups that only contain other elements we're already tracking
            if (el.tagName === 'g') {
                const hasDrawableChildren = el.querySelector('path, circle, rect, ellipse, line, polyline, polygon');
                if (!hasDrawableChildren) return;
            }

            const id = el.id || `element-${index}`;
            if (!el.id) el.id = id;

            const tagName = el.tagName.toLowerCase();
            let name = el.getAttribute('data-name') || el.id || `${tagName}-${index}`;

            this.layers.push({
                id: id,
                element: el,
                name: name,
                visible: true
            });
        });
    }

    render() {
        const layersList = document.getElementById('layersList');
        if (!layersList) return;

        layersList.innerHTML = '';

        if (this.layers.length === 0) {
            layersList.innerHTML = '<p class="empty-message">No layers found</p>';
            return;
        }

        this.layers.forEach((layer, index) => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.dataset.layerId = layer.id;
            item.dataset.layerIndex = index;

            if (this.editor.selectedElements.has(layer.element)) {
                item.classList.add('selected');
            }

            item.innerHTML = `
                <input type="checkbox" id="layer-${layer.id}" ${layer.visible ? 'checked' : ''}>
                <label for="layer-${layer.id}">${layer.name}</label>
            `;

            // Toggle visibility
            item.querySelector('input').addEventListener('change', (e) => {
                layer.visible = e.target.checked;
                layer.element.style.display = e.target.checked ? '' : 'none';
            });

            // Select layer
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    if (e.shiftKey && this.lastSelectedLayerIndex !== null) {
                        // Range selection: apply the clicked layer's selection state to all layers in range
                        // Save the last selected index
                        const rangeStartIndex = this.lastSelectedLayerIndex;
                        const startIndex = Math.min(rangeStartIndex, index);
                        const endIndex = Math.max(rangeStartIndex, index);

                        // Determine what to do based on the clicked layer's current state
                        const clickedLayerElement = layer.element;
                        const shouldSelect = !this.editor.selectedElements.has(clickedLayerElement);

                        // Apply the same selection state to all layers in the range
                        for (let i = startIndex; i <= endIndex; i++) {
                            const layerElement = this.layers[i].element;
                            if (shouldSelect) {
                                // Select all in range
                                if (!this.editor.selectedElements.has(layerElement)) {
                                    this.editor.selectedElements.add(layerElement);
                                    layerElement.classList.add('selected');
                                }
                            } else {
                                // Deselect all in range
                                if (this.editor.selectedElements.has(layerElement)) {
                                    this.editor.selectedElements.delete(layerElement);
                                    layerElement.classList.remove('selected');
                                }
                            }
                        }

                        // Update last selected to the clicked layer
                        this.lastSelectedLayerIndex = index;

                        // Update UI
                        this.editor.updateControlPanel();
                        this.editor.updateTransformPanel();
                        this.editor.updateBoundingBox();
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd click: toggle individual layer
                        this.editor.selectElement(layer.element, true);
                        // Update last selected if this layer is now selected
                        if (this.editor.selectedElements.has(layer.element)) {
                            this.lastSelectedLayerIndex = index;
                        }
                    } else {
                        // Regular click: clear and select only this layer
                        this.editor.clearSelection();
                        this.editor.selectElement(layer.element, false);
                        this.lastSelectedLayerIndex = index;
                    }
                    this.render();
                }
            });

            layersList.appendChild(item);
        });
    }
}




