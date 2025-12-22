class SVGEditor {
    constructor() {
        this.currentTool = 'select';
        this.selectedElements = new Set();
        this.selectedNodes = new Set();
        this.layers = [];
        this.lastSelectedLayerIndex = null; // Track last selected layer for range selection
        this.svgElement = null;
        this.svgWrapper = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };
        this.nodeHandles = [];
        this.currentDraggedElement = null;
        this.currentDraggedNode = null;
        this.selectedNodesInitialPositions = new Map(); // Store initial positions of all selected nodes when drag starts
        this.proximityThreshold = 10; // pixels - distance threshold for selecting paths
        this.proximitySelectedElement = null; // Track element selected via proximity
        this.lastValidStrokeWidth = 1; // Track last valid stroke width
        
        // Load DPI from localStorage or use default (96 DPI is standard)
        this.dpi = parseFloat(localStorage.getItem('svgEditorDPI')) || 96;
        this.transformUnit = localStorage.getItem('svgEditorTransformUnit') || 'px';
        
        // Load arrow key increments from localStorage or use defaults
        this.arrowKeyIncrement = parseFloat(localStorage.getItem('svgEditorArrowKeyIncrement')) || 1;
        this.shiftArrowKeyIncrement = parseFloat(localStorage.getItem('svgEditorShiftArrowKeyIncrement')) || 10;
        
        // Zoom and pan state
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.panStartOffset = { x: 0, y: 0 };
        
        // Bounding box and transform handles
        this.boundingBoxOverlay = null;
        this.boundingBox = null;
        this.isTransforming = false;
        this.transformHandle = null;
        this.transformStart = { x: 0, y: 0 };
        this.transformStartBBox = null;
        this.transformStartStates = new Map();
        this.transformStartCenters = new Map(); // Store center in element-local coords
        this.transformStartElementData = new Map(); // Store original element data for scaling
        this.isUpdatingScaleInput = false; // Flag to prevent recursive updates
        
        this.init();
    }
    
    init() {
        // Setup file input
        document.getElementById('openBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('fileInput').click();
            this.closeMenus();
        });
        
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.loadSVG(e.target.files[0]);
        });
        
        // Setup save button
        document.getElementById('saveBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.saveSVG();
            this.closeMenus();
        });
        
        // Setup settings button
        document.getElementById('settingsBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openSettingsDialog();
            this.closeMenus();
        });
        
        // Setup tool buttons
        document.getElementById('selectTool').addEventListener('click', () => {
            this.setTool('select');
        });
        
        document.getElementById('directSelectTool').addEventListener('click', () => {
            this.setTool('direct-select');
        });
        
        // Setup tooltips
        this.setupTooltips();
        
        // Setup control panel
        this.setupControlPanel();
        
        // Setup menu interactions
        this.setupMenus();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Setup transform panel
        this.setupTransformPanel();
        
        // Setup settings dialog
        this.setupSettingsDialog();
    }
    
    setupTooltips() {
        const toolButtons = document.querySelectorAll('.tool-palette-btn');
        const tooltip = document.createElement('div');
        tooltip.className = 'floating-tooltip';
        tooltip.style.cssText = 'position: fixed; pointer-events: none; z-index: 10000; opacity: 0; transition: opacity 0.2s;';
        document.body.appendChild(tooltip);
        
        toolButtons.forEach(btn => {
            let tooltipText = btn.getAttribute('title') || btn.querySelector('.tool-tooltip')?.textContent || '';
            
            btn.addEventListener('mouseenter', (e) => {
                tooltip.textContent = tooltipText;
                tooltip.style.opacity = '0';
                tooltip.style.display = 'block';
                this.updateTooltipPosition(e, tooltip);
            });
            
            btn.addEventListener('mousemove', (e) => {
                this.updateTooltipPosition(e, tooltip);
                tooltip.style.opacity = '1';
            });
            
            btn.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 200);
            });
        });
    }
    
    updateTooltipPosition(e, tooltip) {
        const offset = 15;
        tooltip.style.left = (e.clientX + offset) + 'px';
        tooltip.style.top = (e.clientY + offset) + 'px';
    }
    
    setupControlPanel() {
        // Fill color controls
        const fillColorInput = document.getElementById('fillColor');
        const fillColorText = document.getElementById('fillColorText');
        
        fillColorInput.addEventListener('input', (e) => {
            fillColorText.value = e.target.value.toUpperCase();
            this.applyFillColor(e.target.value);
        });
        
        fillColorText.addEventListener('change', (e) => {
            const color = e.target.value;
            if (this.isValidColor(color)) {
                fillColorInput.value = color;
                this.applyFillColor(color);
            }
        });
        
        // Stroke color controls
        const strokeColorInput = document.getElementById('strokeColor');
        const strokeColorText = document.getElementById('strokeColorText');
        
        strokeColorInput.addEventListener('input', (e) => {
            strokeColorText.value = e.target.value.toUpperCase();
            this.applyStrokeColor(e.target.value);
        });
        
        strokeColorText.addEventListener('change', (e) => {
            const color = e.target.value;
            if (this.isValidColor(color)) {
                strokeColorInput.value = color;
                this.applyStrokeColor(color);
            }
        });
        
        // Stroke width
        const strokeWidthInput = document.getElementById('strokeWidth');
        strokeWidthInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value >= 0) {
                this.lastValidStrokeWidth = value;
                this.applyStrokeWidth(value);
            }
        });
        strokeWidthInput.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value >= 0) {
                this.lastValidStrokeWidth = value;
                this.applyStrokeWidth(value);
            } else {
                // Reset to last valid value if invalid
                e.target.value = this.lastValidStrokeWidth || 1;
                this.applyStrokeWidth(this.lastValidStrokeWidth || 1);
            }
        });
        
        // Opacity
        const opacityInput = document.getElementById('opacity');
        opacityInput.addEventListener('change', (e) => {
            const opacity = parseFloat(e.target.value);
            if (!isNaN(opacity) && opacity >= 0 && opacity <= 1) {
                this.applyOpacity(opacity);
            }
        });
        
        // Log attributes button
        const logAttributesBtn = document.getElementById('logAttributesBtn');
        logAttributesBtn.addEventListener('click', () => {
            this.logAllAttributes();
        });
    }
    
    isValidColor(color) {
        const s = new Option().style;
        s.color = color;
        return s.color !== '';
    }
    
    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Handle 3-digit hex
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    updateControlPanel() {
        const pathControls = document.getElementById('pathControls');
        const emptyControls = document.getElementById('emptyControls');
        
        // Get the first selected element (or all if we want to show mixed values)
        const selectedArray = Array.from(this.selectedElements);
        
        if (selectedArray.length === 0) {
            pathControls.style.display = 'none';
            emptyControls.style.display = 'block';
            return;
        }
        
        // For now, show controls for the first selected element
        // Could be enhanced to show "mixed" values for multiple selections
        const element = selectedArray[0];
        
        pathControls.style.display = 'flex';
        emptyControls.style.display = 'none';
        
        // Get fill color - check attribute first, then computed style
        let fill = element.getAttribute('fill');
        if (!fill || fill === 'inherit') {
            const computedStyle = window.getComputedStyle(element);
            fill = computedStyle.fill || 'none';
        }
        const fillColor = this.parseColorToHex(fill);
        document.getElementById('fillColor').value = fillColor;
        document.getElementById('fillColorText').value = fillColor.toUpperCase();
        
        // Get stroke color - check attribute first, then computed style
        let stroke = element.getAttribute('stroke');
        if (!stroke || stroke === 'inherit') {
            const computedStyle = window.getComputedStyle(element);
            stroke = computedStyle.stroke || 'none';
        }
        const strokeColor = this.parseColorToHex(stroke);
        document.getElementById('strokeColor').value = strokeColor;
        document.getElementById('strokeColorText').value = strokeColor.toUpperCase();
        
        // Get stroke width - check attribute first, then computed style
        let strokeWidth = element.getAttribute('stroke-width');
        if (!strokeWidth) {
            const computedStyle = window.getComputedStyle(element);
            strokeWidth = computedStyle.strokeWidth || '1';
            // Remove 'px' if present
            strokeWidth = strokeWidth.replace('px', '');
        }
        const strokeWidthValue = parseFloat(strokeWidth) || 1;
        document.getElementById('strokeWidth').value = strokeWidthValue;
        this.lastValidStrokeWidth = strokeWidthValue;
        
        // Get opacity - check attribute first, then computed style
        let opacity = element.getAttribute('opacity');
        if (!opacity || opacity === 'inherit') {
            const computedStyle = window.getComputedStyle(element);
            opacity = computedStyle.opacity || '1';
        }
        document.getElementById('opacity').value = parseFloat(opacity) || 1;
    }
    
    parseColorToHex(color) {
        if (!color || color === 'none' || color === 'transparent' || color === 'inherit') {
            return '#000000';
        }
        
        // Trim whitespace
        color = color.trim();
        
        // If already hex
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                // Expand 3-digit hex to 6-digit
                return '#' + hex.split('').map(c => c + c).join('');
            }
            if (hex.length === 6) {
                return '#' + hex;
            }
            return '#000000';
        }
        
        // If rgb/rgba
        const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        
        // Try to parse as named color or any CSS color
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            // Check if it's actually black (could mean it failed to parse)
            if (data[0] === 0 && data[1] === 0 && data[2] === 0 && color.toLowerCase() !== 'black') {
                // Might be a parsing failure, return default
                return '#000000';
            }
            return '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return '#000000';
        }
    }
    
    applyFillColor(color) {
        this.selectedElements.forEach(element => {
            // Remove fill from style attribute if it exists
            const style = element.getAttribute('style');
            if (style) {
                const stylePairs = style.split(';').filter(pair => {
                    const trimmed = pair.trim();
                    return trimmed && !trimmed.toLowerCase().startsWith('fill');
                });
                const newStyle = stylePairs.join(';').trim();
                if (newStyle) {
                    element.setAttribute('style', newStyle);
                } else {
                    element.removeAttribute('style');
                }
            }
            // Set fill as an attribute (this will replace any existing one)
            if (color === '#000000' || color === '#000') {
                element.setAttribute('fill', 'none');
            } else {
                element.setAttribute('fill', color);
            }
        });
    }
    
    applyStrokeColor(color) {
        this.selectedElements.forEach(element => {
            // Remove stroke from style attribute if it exists
            const style = element.getAttribute('style');
            if (style) {
                const stylePairs = style.split(';').filter(pair => {
                    const trimmed = pair.trim();
                    return trimmed && !trimmed.toLowerCase().startsWith('stroke:') && !trimmed.toLowerCase().startsWith('stroke ');
                });
                const newStyle = stylePairs.join(';').trim();
                if (newStyle) {
                    element.setAttribute('style', newStyle);
                } else {
                    element.removeAttribute('style');
                }
            }
            // Set stroke as an attribute (this will replace any existing one)
            if (color === '#000000' || color === '#000') {
                element.setAttribute('stroke', 'none');
            } else {
                element.setAttribute('stroke', color);
            }
        });
    }
    
    applyStrokeWidth(width) {
        this.selectedElements.forEach(element => {
            // Remove stroke-width from style attribute if it exists
            const style = element.getAttribute('style');
            if (style) {
                // Remove stroke-width from style string
                const stylePairs = style.split(';').filter(pair => {
                    const trimmed = pair.trim();
                    return trimmed && !trimmed.toLowerCase().startsWith('stroke-width');
                });
                const newStyle = stylePairs.join(';').trim();
                if (newStyle) {
                    element.setAttribute('style', newStyle);
                } else {
                    element.removeAttribute('style');
                }
            }
            // Set stroke-width as an attribute (this will replace any existing one)
            element.setAttribute('stroke-width', width);
        });
        console.log(width);
    }
    
    applyOpacity(opacity) {
        this.selectedElements.forEach(element => {
            // Remove opacity from style attribute if it exists
            const style = element.getAttribute('style');
            if (style) {
                const stylePairs = style.split(';').filter(pair => {
                    const trimmed = pair.trim();
                    return trimmed && !trimmed.toLowerCase().startsWith('opacity');
                });
                const newStyle = stylePairs.join(';').trim();
                if (newStyle) {
                    element.setAttribute('style', newStyle);
                } else {
                    element.removeAttribute('style');
                }
            }
            // Set opacity as an attribute (this will replace any existing one)
            element.setAttribute('opacity', opacity);
        });
    }
    
    setupMenus() {
        const menuItems = document.querySelectorAll('.menu-item');
        
        menuItems.forEach(item => {
            const label = item.querySelector('.menu-label');
            
            label.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle active state
                const isActive = item.classList.contains('active');
                this.closeMenus();
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        });
        
        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-item')) {
                this.closeMenus();
            }
        });
    }
    
    closeMenus() {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Arrow keys to move selected elements (only if not typing in an input)
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                // Check if user is typing in an input field
                const isInputFocused = e.target.tagName === 'INPUT' || 
                                       e.target.tagName === 'TEXTAREA' ||
                                       e.target.isContentEditable;
                
                // Only move elements if:
                // 1. Elements are selected
                // 2. User is not typing in an input field
                // 3. Settings dialog is not open
                const settingsDialog = document.getElementById('settingsDialog');
                const isSettingsOpen = settingsDialog && settingsDialog.style.display !== 'none';
                
                if (this.selectedElements.size > 0 && !isInputFocused && !isSettingsOpen) {
                    e.preventDefault();
                    const increment = e.shiftKey ? this.shiftArrowKeyIncrement : this.arrowKeyIncrement;
                    this.moveSelectedElementsWithArrowKeys(e.key, increment);
                    return;
                }
            }
            
            // Don't handle other shortcuts if user is typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            
            // Ctrl+O for Open
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                document.getElementById('fileInput').click();
            }
            
            // Ctrl+S for Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveSVG();
            }
        });
    }
    
    moveSelectedElementsWithArrowKeys(key, increment) {
        let deltaX = 0;
        let deltaY = 0;
        
        switch (key) {
            case 'ArrowUp':
                deltaY = -increment;
                break;
            case 'ArrowDown':
                deltaY = increment;
                break;
            case 'ArrowLeft':
                deltaX = -increment;
                break;
            case 'ArrowRight':
                deltaX = increment;
                break;
        }
        
        // Check if we're in direct-select mode with selected nodes
        if (this.currentTool === 'direct-select' && this.selectedNodes.size > 0) {
            // Move selected nodes
            this.moveSelectedNodesWithArrowKeys(deltaX, deltaY);
        } else if (this.selectedElements.size > 0) {
            // Move selected elements
            this.selectedElements.forEach(element => {
                const transform = this.getElementTransform(element);
                this.moveElement(element, transform.x + deltaX, transform.y + deltaY);
            });
        }
        
        // Update layers panel and transform panel if open
        this.renderLayersPanel();
        if (this.isTransforming) {
            this.updateBoundingBox();
        }
    }
    
    moveSelectedNodesWithArrowKeys(deltaX, deltaY) {
        // Collect all affected elements first
        const affectedElements = new Set();
        
        // Move all selected nodes by the delta
        this.selectedNodes.forEach(nodeId => {
            const nodeInfo = this.parseNodeId(nodeId);
            if (!nodeInfo) return;
            
            const { element, index, pointType } = nodeInfo;
            
            // Track which elements are affected
            if (element) {
                affectedElements.add(element);
            }
            
            // Get current position of the node
            const currentPos = this.getNodePosition(nodeInfo);
            if (!currentPos) return;
            
            // Calculate new position
            const newX = currentPos.x + deltaX;
            const newY = currentPos.y + deltaY;
            
            // Move the node
            if (element.tagName === 'path') {
                this.moveNode(element, index, newX, newY, pointType);
            } else {
                // For non-path elements (rectangles, circles, etc.), move the corner
                this.moveElementCorner(element, index, newX, newY);
            }
        });
        
        // Update node handles to reflect new positions
        // Refresh handles for all affected elements (selection state is preserved)
        affectedElements.forEach(element => {
            // Refresh handles - selection state will be preserved by showNodeHandles
            this.showNodeHandles(element);
        });
        
        // Update transform panel if open (shape may have changed)
        this.updateTransformPanel();
    }
    
    setTool(tool) {
        this.currentTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-palette-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        
        // Clear node handles when switching tools
        if (tool === 'select') {
            this.clearNodeHandles();
        }
    }
    
    async loadSVG(file) {
        if (!file) return;
        
        const text = await file.text();
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(text, 'image/svg+xml');
        const svg = svgDoc.querySelector('svg');
        
        if (!svg) {
            alert('Invalid SVG file');
            return;
        }
        
        // Clear previous content
        const container = document.getElementById('svgContainer');
        container.innerHTML = '';
        this.svgWrapper = null;
        
        // Create wrapper div for zoom/pan transforms
        const wrapper = document.createElement('div');
        wrapper.className = 'svg-wrapper';
        wrapper.style.cssText = 'display: inline-block; transform-origin: 0 0;';
        
        // Clone and add SVG to wrapper
        this.svgElement = svg.cloneNode(true);
        wrapper.appendChild(this.svgElement);
        container.appendChild(wrapper);
        this.svgWrapper = wrapper;
        
        // Reset zoom and pan for new SVG
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.applyTransform();
        
        // Extract layers (paths and other drawable elements)
        this.extractLayers();
        this.renderLayersPanel();
        this.attachEventListeners();
        
        // Create or recreate bounding box overlay
        // Remove old one if it exists
        const oldBBoxGroup = this.svgElement.querySelector('#boundingBoxGroup');
        if (oldBBoxGroup) {
            oldBBoxGroup.remove();
        }
        this.createBoundingBoxOverlay();
    }
    
    extractLayers() {
        this.layers = [];
        const elements = this.svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, g');
        
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
    
    renderLayersPanel() {
        const layersList = document.getElementById('layersList');
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
            
            if (this.selectedElements.has(layer.element)) {
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
                        const shouldSelect = !this.selectedElements.has(clickedLayerElement);
                        
                        // Apply the same selection state to all layers in the range
                        for (let i = startIndex; i <= endIndex; i++) {
                            const layerElement = this.layers[i].element;
                            if (shouldSelect) {
                                // Select all in range
                                if (!this.selectedElements.has(layerElement)) {
                                    this.selectedElements.add(layerElement);
                                    layerElement.classList.add('selected');
                                }
                            } else {
                                // Deselect all in range
                                if (this.selectedElements.has(layerElement)) {
                                    this.selectedElements.delete(layerElement);
                                    layerElement.classList.remove('selected');
                                }
                            }
                        }
                        
                        // Update last selected to the clicked layer
                        this.lastSelectedLayerIndex = index;
                        
                        // Update UI
                        this.updateControlPanel();
                        this.updateTransformPanel();
                        this.updateBoundingBox();
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd click: toggle individual layer
                        this.selectElement(layer.element, true);
                        // Update last selected if this layer is now selected
                        if (this.selectedElements.has(layer.element)) {
                            this.lastSelectedLayerIndex = index;
                        }
                    } else {
                        // Regular click: clear and select only this layer
                        this.clearSelection();
                        this.selectElement(layer.element, false);
                        this.lastSelectedLayerIndex = index;
                    }
                    this.renderLayersPanel();
                }
            });
            
            layersList.appendChild(item);
        });
    }
    
    attachEventListeners() {
        if (!this.svgElement) return;
        
        // Clear selection when cloning to avoid stale references
        this.clearSelection();
        
        // Remove old listeners by cloning
        const newSvg = this.svgElement.cloneNode(true);
        this.svgElement.parentNode.replaceChild(newSvg, this.svgElement);
        this.svgElement = newSvg;
        
        // Update layer references
        this.layers.forEach(layer => {
            const newElement = this.svgElement.querySelector(`#${layer.id}`);
            if (newElement) {
                layer.element = newElement;
            }
        });
        
        // Use event delegation on the SVG element itself
        this.svgElement.addEventListener('mousedown', (e) => {
            // Ignore middle mouse button (panning)
            if (e.button === 1) {
                return;
            }
            
            const target = e.target;
            
            // Ignore bounding box handles - they have their own handlers
            if (target && (target.classList.contains('bbox-handle') || target.classList.contains('bbox-rotation-handle'))) {
                return;
            }
            
            // First check for direct hit
            if (target && target !== this.svgElement && 
                (target.tagName === 'path' || target.tagName === 'circle' || 
                 target.tagName === 'rect' || target.tagName === 'ellipse' || 
                 target.tagName === 'line' || target.tagName === 'polyline' || 
                 target.tagName === 'polygon')) {
                e.stopPropagation();
                // Clear proximity tracking since we have a direct hit
                this.proximitySelectedElement = null;
                this.handleMouseDown(e, target);
            } else {
                // No direct hit - check for proximity to thin elements (paths, lines, etc.)
                // First get elements at the click point to respect z-order
                const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
                const thinElementsAtPoint = elementsAtPoint.filter(el => {
                    // Skip bounding box elements
                    if (el.closest && el.closest('#boundingBoxGroup')) return false;
                    if (el.classList && (el.classList.contains('bbox-handle') || el.classList.contains('bbox-rotation-handle'))) return false;
                    return el !== this.svgElement && 
                           (el.tagName === 'path' || el.tagName === 'line' || 
                            el.tagName === 'polyline' || el.tagName === 'polygon');
                });
                
                // Check elements at the point first (respects z-order)
                let nearestElement = null;
                if (thinElementsAtPoint.length > 0) {
                    nearestElement = this.findNearestThinElementAtPoint(thinElementsAtPoint, e.clientX, e.clientY);
                }
                
                // If no element found at point, check all thin elements
                if (!nearestElement) {
                    nearestElement = this.findNearestThinElement(e.clientX, e.clientY);
                }
                
                if (nearestElement) {
                    e.stopPropagation();
                    // Track that this element was selected via proximity
                    this.proximitySelectedElement = nearestElement;
                    this.handleMouseDown(e, nearestElement);
                }
            }
        });
        
        this.svgElement.addEventListener('click', (e) => {
            const target = e.target;
            if (target && target !== this.svgElement && 
                (target.tagName === 'path' || target.tagName === 'circle' || 
                 target.tagName === 'rect' || target.tagName === 'ellipse' || 
                 target.tagName === 'line' || target.tagName === 'polyline' || 
                 target.tagName === 'polygon')) {
                e.stopPropagation();
                if (!this.wasDragging && this.currentTool === 'select') {
                    // Selection already happened in mousedown, just update UI
                    this.renderLayersPanel();
                }
                // Clear proximity tracking since we have a direct hit
                this.proximitySelectedElement = null;
            } else if (target === this.svgElement && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // Don't clear selection if we just selected an element via proximity
                if (!this.proximitySelectedElement) {
                    this.clearSelection();
                    this.renderLayersPanel();
                } else {
                    // Element was selected via proximity, just update UI and clear tracking
                    this.renderLayersPanel();
                    this.proximitySelectedElement = null;
                }
            }
        });
        
        // Add canvas-level mouse events
        this.svgElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Add zoom and pan event handlers
        this.setupZoomAndPan();
    }
    
    handleMouseDown(e, element) {
        e.preventDefault();
        e.stopPropagation();
        
        // Track if we actually moved (to distinguish click from drag)
        this.wasDragging = false;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
        
        if (this.currentTool === 'select') {
            // Select immediately on mousedown
            const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
            if (!isMultiSelect && !this.selectedElements.has(element)) {
                this.clearSelection();
            }
            this.selectElement(element, isMultiSelect);
            this.renderLayersPanel();
            
            this.isDragging = true;
            this.currentDraggedElement = element;
            
            // Convert initial mouse position to SVG coordinates
            const point = this.svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
            
            // Store initial click position in SVG coordinates
            this.dragStart = {
                x: svgPoint.x,
                y: svgPoint.y
            };
            
            // Store initial element translate transform
            const transform = this.getElementTransform(element);
            this.dragOffset = {
                x: transform.x,
                y: transform.y
            };
            
            element.classList.add('dragging');
        } else if (this.currentTool === 'direct-select') {
            const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
            this.selectElement(element, isMultiSelect);
            this.renderLayersPanel();
            this.showNodeHandles(element);
        }
    }
    
    handleMouseMove(e) {
        // Handle panning with middle mouse button
        if (this.isPanning) {
            const container = document.getElementById('svgContainer');
            if (container) {
                const deltaX = e.clientX - this.panStart.x;
                const deltaY = e.clientY - this.panStart.y;
                this.panOffset.x = this.panStartOffset.x + deltaX;
                this.panOffset.y = this.panStartOffset.y + deltaY;
                this.applyTransform();
            }
            return;
        }
        
        // Handle bounding box transforms (scale/rotate)
        if (this.isTransforming && this.currentTool === 'select') {
            this.handleBoundingBoxTransform(e);
            return;
        }
        
        if (this.currentTool === 'select' && this.isDragging && this.currentDraggedElement) {
            // Check if we've moved enough to consider it a drag
            const moveThreshold = 3;
            const movedX = Math.abs(e.clientX - this.dragStartPos.x);
            const movedY = Math.abs(e.clientY - this.dragStartPos.y);
            
            if (movedX > moveThreshold || movedY > moveThreshold) {
                this.wasDragging = true;
            }
            
            // Convert current mouse position to SVG coordinates
            const point = this.svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
            
            // Calculate delta from initial click position
            const deltaX = svgPoint.x - this.dragStart.x;
            const deltaY = svgPoint.y - this.dragStart.y;
            
            // Apply delta to initial transform
            this.moveElement(this.currentDraggedElement, 
                this.dragOffset.x + deltaX, 
                this.dragOffset.y + deltaY);
            
            // Update bounding box during drag
            this.updateBoundingBox();
        } else if (this.currentTool === 'direct-select' && this.isDragging && this.currentDraggedNode) {
            const rect = this.svgElement.getBoundingClientRect();
            const point = this.svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            
            // Convert screen coordinates to SVG coordinates
            const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
            
            // Get the nodeId for the current dragged node
            const elementId = this.currentDraggedNode.element.id || '';
            const index = this.currentDraggedNode.index;
            const pointType = this.currentDraggedNode.controlPoint === 1 ? 'control1' : 
                             this.currentDraggedNode.controlPoint === 2 ? 'control2' : 'main';
            const currentNodeId = `${elementId}-${index}-${pointType}`;
            
            // Get initial position of the current dragged node
            const currentInitialData = this.selectedNodesInitialPositions.get(currentNodeId);
            if (!currentInitialData) {
                // Fallback: just move the current node if we don't have initial position
                this.moveNode(this.currentDraggedNode.element, 
                    this.currentDraggedNode.index, 
                    svgPoint.x, 
                    svgPoint.y);
            } else {
                // Calculate delta from initial position
                const deltaX = svgPoint.x - currentInitialData.pos.x;
                const deltaY = svgPoint.y - currentInitialData.pos.y;
                
                // Move all selected nodes by the same delta
                this.selectedNodes.forEach(nodeId => {
                    const nodeData = this.selectedNodesInitialPositions.get(nodeId);
                    if (!nodeData || !nodeData.nodeInfo) return;
                    
                    const { nodeInfo, pos } = nodeData;
                    
                    // Calculate new position
                    const newX = pos.x + deltaX;
                    const newY = pos.y + deltaY;
                    
                    // Move this node
                    if (nodeInfo.element.tagName === 'path') {
                        this.moveNode(nodeInfo.element, nodeInfo.index, newX, newY, nodeInfo.pointType);
                    } else {
                        // For non-path elements, we need to handle corner movement differently
                        // This would require moving the entire element, which is more complex
                        // For now, skip non-path elements in multi-node drag
                    }
                });
            }
            
            // Update transform panel during node dragging (shape may change)
            this.updateTransformPanel();
        }
    }
    
    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            if (this.currentDraggedElement) {
                this.currentDraggedElement.classList.remove('dragging');
                // Ensure the element remains selected after drag
                if (this.proximitySelectedElement === this.currentDraggedElement) {
                    this.selectElement(this.currentDraggedElement, false);
                }
                this.currentDraggedElement = null;
            }
            this.currentDraggedNode = null;
            this.selectedNodesInitialPositions.clear();
            this.wasDragging = false;
            // Update layers panel after drag completes
            this.renderLayersPanel();
            // Update bounding box after drag completes
            this.updateBoundingBox();
        }
        
        // Handle pan end
        if (this.isPanning && e.button === 1) {
            this.isPanning = false;
            e.preventDefault();
        }
        
        // Handle transform end
        if (this.isTransforming) {
            this.isTransforming = false;
            this.transformHandle = null;
        }
    }
    
    setupZoomAndPan() {
        if (!this.svgElement) return;
        
        const container = document.getElementById('svgContainer');
        if (!container) return;
        
        // Handle mouse wheel for zooming
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            if (!this.svgElement) return;
            
            // Get mouse position relative to container
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate zoom factor (positive deltaY = scroll down = zoom out)
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = this.zoomLevel * zoomFactor;
            
            // Limit zoom range
            const minZoom = 0.1;
            const maxZoom = 10;
            if (newZoom < minZoom || newZoom > maxZoom) return;
            
            // Calculate point in SVG coordinates before zoom
            // First, convert mouse position to SVG coordinates
            const pointBeforeZoom = {
                x: (mouseX - this.panOffset.x) / this.zoomLevel,
                y: (mouseY - this.panOffset.y) / this.zoomLevel
            };
            
            // Apply zoom
            this.zoomLevel = newZoom;
            
            // Adjust pan so the same point is under the mouse after zoom
            this.panOffset.x = mouseX - pointBeforeZoom.x * this.zoomLevel;
            this.panOffset.y = mouseY - pointBeforeZoom.y * this.zoomLevel;
            
            this.applyTransform();
        }, { passive: false });
        
        // Handle middle mouse button for panning
        container.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse button
                e.preventDefault();
                this.isPanning = true;
                this.panStart.x = e.clientX;
                this.panStart.y = e.clientY;
                this.panStartOffset.x = this.panOffset.x;
                this.panStartOffset.y = this.panOffset.y;
                container.style.cursor = 'grabbing';
            }
        });
        
        // Update cursor on mouse move when panning
        container.addEventListener('mousemove', (e) => {
            if (e.buttons === 4) { // Middle mouse button pressed
                container.style.cursor = 'grabbing';
            } else if (!this.isPanning) {
                container.style.cursor = 'default';
            }
        });
        
        // Reset cursor when mouse leaves container
        container.addEventListener('mouseleave', () => {
            if (!this.isPanning) {
                container.style.cursor = 'default';
            }
        });
        
        // Reset cursor when panning ends
        document.addEventListener('mouseup', (e) => {
            if (e.button === 1 && this.isPanning) {
                container.style.cursor = 'default';
            }
        });
        
        // Prevent context menu on middle mouse button
        container.addEventListener('contextmenu', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });
    }
    
    applyTransform() {
        if (!this.svgWrapper) return;
        
        // Apply transform to wrapper div
        const transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.zoomLevel})`;
        this.svgWrapper.style.transform = transform;
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
        const layerIndex = this.layers.findIndex(layer => layer.element === element);
        if (layerIndex !== -1 && this.selectedElements.has(element)) {
            this.lastSelectedLayerIndex = layerIndex;
        }
        
        // Force a reflow to ensure the class is applied
        element.offsetHeight;
        
        // Update control panel when selection changes
        this.updateControlPanel();
        
        // Update transform panel when selection changes
        this.updateTransformPanel();
        
        // Update bounding box
        this.updateBoundingBox();
    }
    
    selectNode(nodeHandle, multiSelect = false) {
        if (!nodeHandle) return;
        
        // Create a unique identifier for the node
        // Handle both path nodes (commandIndex) and element corner handles (cornerIndex)
        const commandIndex = nodeHandle.dataset.commandIndex;
        const cornerIndex = nodeHandle.dataset.cornerIndex;
        const pointType = nodeHandle.dataset.pointType || (cornerIndex !== undefined ? `corner${cornerIndex}` : 'main');
        const index = commandIndex !== undefined ? commandIndex : cornerIndex;
        const elementId = nodeHandle.dataset.elementId || '';
        const nodeId = `${elementId}-${index}-${pointType}`;
        
        if (!multiSelect) {
            this.clearNodeSelection();
        }
        
        if (this.selectedNodes.has(nodeId)) {
            this.selectedNodes.delete(nodeId);
            nodeHandle.classList.remove('selected');
        } else {
            this.selectedNodes.add(nodeId);
            nodeHandle.classList.add('selected');
        }
    }
    
    clearNodeSelection() {
        // Clear selection from all node handles
        this.nodeHandles.forEach(handle => {
            handle.classList.remove('selected');
        });
        this.selectedNodes.clear();
    }
    
    clearSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove('selected');
        });
        this.selectedElements.clear();
        this.clearNodeSelection();
        this.clearNodeHandles();
        this.lastSelectedLayerIndex = null; // Reset last selected layer index
        this.updateControlPanel();
        this.updateTransformPanel();
        this.updateBoundingBox();
    }
    
    getElementTransform(element) {
        const transform = element.getAttribute('transform');
        if (!transform) return { x: 0, y: 0 };
        
        const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (translateMatch) {
            return {
                x: parseFloat(translateMatch[1]) || 0,
                y: parseFloat(translateMatch[2]) || 0
            };
        }
        
        return { x: 0, y: 0 };
    }
    
    moveElement(element, x, y) {
        // Remove existing translate
        let transform = element.getAttribute('transform') || '';
        transform = transform.replace(/translate\([^)]+\)/g, '').trim();
        
        // Add new translate
        const translate = `translate(${x}, ${y})`;
        transform = transform ? `${translate} ${transform}` : translate;
        
        element.setAttribute('transform', transform);
    }
    
    showNodeHandles(element) {
        this.clearNodeHandles();
        
        if (element.tagName !== 'path') {
            // For non-path elements, show handles at key points
            this.showElementHandles(element);
            return;
        }
        
        // For paths, extract all points in SVG coordinate space
        const pathData = element.getAttribute('d');
        if (!pathData) return;
        
        const commands = this.parsePathData(pathData);
        const svgNS = 'http://www.w3.org/2000/svg';
        
        commands.forEach((cmd, index) => {
            if (cmd.type === 'M' || cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q') {
                // Transform point from element-local (path data) to rendered SVG space
                const mainSvg = this.toRootCoords(element, cmd.x, cmd.y);

                const handle = document.createElementNS(svgNS, 'circle');
                handle.setAttribute('class', 'node-handle');
                handle.setAttribute('cx', mainSvg.x);
                handle.setAttribute('cy', mainSvg.y);
                handle.dataset.elementId = element.id;
                handle.dataset.commandIndex = index;
                handle.dataset.pointType = 'main';
                
                // Restore selection state if this node was previously selected
                const nodeId = `${element.id || ''}-${index}-main`;
                if (this.selectedNodes.has(nodeId)) {
                    handle.classList.add('selected');
                }
                
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                    this.selectNode(handle, isMultiSelect);
                    this.isDragging = true;
                    this.currentDraggedNode = {
                        element: element,
                        index: index,
                        command: cmd
                    };
                    
                    // Store initial positions of all selected nodes
                    this.selectedNodesInitialPositions.clear();
                    this.selectedNodes.forEach(nodeId => {
                        const nodeInfo = this.parseNodeId(nodeId);
                        if (nodeInfo) {
                            const pos = this.getNodePosition(nodeInfo);
                            if (pos) {
                                this.selectedNodesInitialPositions.set(nodeId, { nodeInfo, pos });
                            }
                        }
                    });
                });
                
                this.svgElement.appendChild(handle);
                this.nodeHandles.push(handle);
                
                // For curves, show control points (transform to rendered space as well)
                if (cmd.type === 'C') {
                    const cp1Svg = this.toRootCoords(element, cmd.x1, cmd.y1);
                    const cp1 = document.createElementNS(svgNS, 'circle');
                    cp1.setAttribute('class', 'node-handle');
                    cp1.setAttribute('cx', cp1Svg.x);
                    cp1.setAttribute('cy', cp1Svg.y);
                    cp1.dataset.elementId = element.id;
                    cp1.dataset.commandIndex = index;
                    cp1.dataset.pointType = 'control1';
                    cp1.style.fill = '#ff9800';
                    
                    // Restore selection state if this node was previously selected
                    const cp1NodeId = `${element.id || ''}-${index}-control1`;
                    if (this.selectedNodes.has(cp1NodeId)) {
                        cp1.classList.add('selected');
                    }
                    
                    cp1.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                        this.selectNode(cp1, isMultiSelect);
                        this.isDragging = true;
                        this.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 1
                        };
                        
                        // Store initial positions of all selected nodes
                        this.selectedNodesInitialPositions.clear();
                        this.selectedNodes.forEach(nodeId => {
                            const nodeInfo = this.parseNodeId(nodeId);
                            if (nodeInfo) {
                                const pos = this.getNodePosition(nodeInfo);
                                if (pos) {
                                    this.selectedNodesInitialPositions.set(nodeId, pos);
                                }
                            }
                        });
                    });
                    
                    this.svgElement.appendChild(cp1);
                    this.nodeHandles.push(cp1);
                    
                    const cp2Svg = this.toRootCoords(element, cmd.x2, cmd.y2);
                    const cp2 = document.createElementNS(svgNS, 'circle');
                    cp2.setAttribute('class', 'node-handle');
                    cp2.setAttribute('cx', cp2Svg.x);
                    cp2.setAttribute('cy', cp2Svg.y);
                    cp2.dataset.elementId = element.id;
                    cp2.dataset.commandIndex = index;
                    cp2.dataset.pointType = 'control2';
                    cp2.style.fill = '#ff9800';
                    
                    // Restore selection state if this node was previously selected
                    const cp2NodeId = `${element.id || ''}-${index}-control2`;
                    if (this.selectedNodes.has(cp2NodeId)) {
                        cp2.classList.add('selected');
                    }
                    
                    cp2.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                        this.selectNode(cp2, isMultiSelect);
                        this.isDragging = true;
                        this.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 2
                        };
                        
                        // Store initial positions of all selected nodes
                        this.selectedNodesInitialPositions.clear();
                        this.selectedNodes.forEach(nodeId => {
                            const nodeInfo = this.parseNodeId(nodeId);
                            if (nodeInfo) {
                                const pos = this.getNodePosition(nodeInfo);
                                if (pos) {
                                    this.selectedNodesInitialPositions.set(nodeId, pos);
                                }
                            }
                        });
                    });
                    
                    this.svgElement.appendChild(cp2);
                    this.nodeHandles.push(cp2);
                }
            }
        });
    }
    
    showElementHandles(element) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const bbox = element.getBBox();
        
        // Show handles at corners (convert from element space to SVG space)
        const corners = [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
            { x: bbox.x, y: bbox.y + bbox.height }
        ];
        
        corners.forEach((corner, index) => {
            const cornerSvg = this.toRootCoords(element, corner.x, corner.y);

            const handle = document.createElementNS(svgNS, 'circle');
            handle.setAttribute('class', 'node-handle');
            handle.setAttribute('cx', cornerSvg.x);
            handle.setAttribute('cy', cornerSvg.y);
            handle.dataset.elementId = element.id;
            handle.dataset.cornerIndex = index;
            
            // Restore selection state if this node was previously selected
            // Note: selectNode generates IDs as: elementId-cornerIndex-corner{cornerIndex}
            const cornerNodeId = `${element.id || ''}-${index}-corner${index}`;
            if (this.selectedNodes.has(cornerNodeId)) {
                handle.classList.add('selected');
            }
            
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
                this.selectNode(handle, isMultiSelect);
                // For non-path elements, we'll move the entire element
                this.isDragging = true;
                this.currentDraggedElement = element;
                const point = this.svgElement.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
                this.dragStart = {
                    x: svgPoint.x,
                    y: svgPoint.y
                };
                const transform = this.getElementTransform(element);
                this.dragOffset = {
                    x: transform.x,
                    y: transform.y
                };
            });
            
            this.svgElement.appendChild(handle);
            this.nodeHandles.push(handle);
        });
    }
    
    clearNodeHandles() {
        this.nodeHandles.forEach(handle => {
            if (handle.parentNode) {
                handle.parentNode.removeChild(handle);
            }
        });
        this.nodeHandles = [];
        // Note: We preserve selectedNodes Set so selection can be restored when handles are recreated
    }

    // Helpers to map between element-local coordinates and SVG root coordinates
    toRootCoords(element, x, y) {
        const point = this.svgElement.createSVGPoint();
        point.x = x;
        point.y = y;
        const elemScreenCTM = element.getScreenCTM();
        const rootScreenCTM = this.svgElement.getScreenCTM();
        if (!elemScreenCTM || !rootScreenCTM) return { x, y };
        // local -> screen
        const screenPt = point.matrixTransform(elemScreenCTM);
        // screen -> root user space
        const rootPt = screenPt.matrixTransform(rootScreenCTM.inverse());
        return { x: rootPt.x, y: rootPt.y };
    }

    toLocalCoords(element, x, y) {
        const point = this.svgElement.createSVGPoint();
        point.x = x;
        point.y = y;
        const elemScreenCTM = element.getScreenCTM();
        const rootScreenCTM = this.svgElement.getScreenCTM();
        if (!elemScreenCTM || !rootScreenCTM) return { x, y };
        // root user -> screen
        const screenPt = point.matrixTransform(rootScreenCTM);
        // screen -> local
        const localPt = screenPt.matrixTransform(elemScreenCTM.inverse());
        return { x: localPt.x, y: localPt.y };
    }
    
    // Get node info from nodeHandles by matching nodeId
    getNodeInfoFromHandles(nodeId) {
        for (const handle of this.nodeHandles) {
            const handleElementId = handle.dataset.elementId || '';
            const commandIndex = handle.dataset.commandIndex;
            const cornerIndex = handle.dataset.cornerIndex;
            const pointType = handle.dataset.pointType || (cornerIndex !== undefined ? `corner${cornerIndex}` : 'main');
            const index = commandIndex !== undefined ? commandIndex : cornerIndex;
            const handleNodeId = `${handleElementId}-${index}-${pointType}`;
            
            if (handleNodeId === nodeId) {
                // Find the element - search by ID or find the element that this handle was created for
                let element = handleElementId ? document.getElementById(handleElementId) : null;
                
                // If not found by ID, search through all elements
                if (!element) {
                    const allElements = this.svgElement.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon');
                    for (const el of allElements) {
                        if ((el.id || '') === handleElementId) {
                            element = el;
                            break;
                        }
                    }
                }
                
                if (element) {
                    return { element, index: parseInt(index), pointType };
                }
            }
        }
        return null;
    }
    
    // Parse nodeId to extract element, index, and point type (fallback method)
    parseNodeId(nodeId) {
        // First try to get from nodeHandles (more reliable)
        const nodeInfo = this.getNodeInfoFromHandles(nodeId);
        if (nodeInfo) return nodeInfo;
        
        // Fallback: parse the nodeId string
        const parts = nodeId.split('-');
        if (parts.length < 3) return null;
        
        const elementId = parts[0];
        const index = parseInt(parts[1]);
        const pointType = parts.slice(2).join('-'); // Handle point types like "corner0"
        
        // Try to find element by ID
        const element = elementId ? document.getElementById(elementId) : null;
        if (!element) return null;
        
        return { element, index, pointType };
    }
    
    // Get current position of a node in root SVG coordinates
    getNodePosition(nodeInfo) {
        const { element, index, pointType } = nodeInfo;
        
        if (element.tagName === 'path') {
            const pathData = element.getAttribute('d');
            const commands = this.parsePathData(pathData);
            
            if (index >= commands.length) return null;
            
            const cmd = commands[index];
            
            if (pointType === 'control1') {
                return this.toRootCoords(element, cmd.x1, cmd.y1);
            } else if (pointType === 'control2') {
                return this.toRootCoords(element, cmd.x2, cmd.y2);
            } else if (pointType === 'main') {
                return this.toRootCoords(element, cmd.x, cmd.y);
            }
        } else {
            // For non-path elements, get corner position
            const bbox = element.getBBox();
            const corners = [
                { x: bbox.x, y: bbox.y },
                { x: bbox.x + bbox.width, y: bbox.y },
                { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
                { x: bbox.x, y: bbox.y + bbox.height }
            ];
            
            if (index >= 0 && index < corners.length) {
                return this.toRootCoords(element, corners[index].x, corners[index].y);
            }
        }
        
        return null;
    }
    
    findNearestThinElementAtPoint(elements, screenX, screenY) {
        let nearestElement = null;
        let minDistance = this.proximityThreshold;
        
        // Check elements in order (top to bottom, respecting z-order)
        for (const element of elements) {
            if (element.style.display === 'none') continue;
            
            const distance = this.getDistanceToElementScreen(element, screenX, screenY);
            if (distance < minDistance) {
                minDistance = distance;
                nearestElement = element;
            }
        }
        
        return nearestElement;
    }
    
    findNearestThinElement(screenX, screenY) {
        if (!this.svgElement) return null;
        
        // Check paths, lines, polylines, and polygons (thin elements that are hard to click)
        // Check in reverse order so elements that appear later (on top) are checked first
        const thinElements = Array.from(this.svgElement.querySelectorAll('path, line, polyline, polygon')).reverse();
        let nearestElement = null;
        let minDistance = this.proximityThreshold;
        
        thinElements.forEach(element => {
            // Skip if element is not visible
            if (element.style.display === 'none') return;
            
            const distance = this.getDistanceToElementScreen(element, screenX, screenY);
            if (distance < minDistance) {
                minDistance = distance;
                nearestElement = element;
            }
        });
        
        return nearestElement;
    }
    
    getDistanceToElement(element, point) {
        if (element.tagName === 'path') {
            return this.getDistanceToPath(element, point);
        } else if (element.tagName === 'line') {
            return this.getDistanceToLine(element, point);
        } else if (element.tagName === 'polyline' || element.tagName === 'polygon') {
            return this.getDistanceToPolyline(element, point);
        }
        return Infinity;
    }
    
    getDistanceToElementScreen(element, screenX, screenY) {
        // Convert screen coordinates to SVG coordinates for the point
        const point = this.svgElement.createSVGPoint();
        point.x = screenX;
        point.y = screenY;
        const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
        
        if (element.tagName === 'path') {
            return this.getDistanceToPathScreen(element, svgPoint, screenX, screenY);
        } else if (element.tagName === 'line') {
            return this.getDistanceToLineScreen(element, svgPoint, screenX, screenY);
        } else if (element.tagName === 'polyline' || element.tagName === 'polygon') {
            return this.getDistanceToPolylineScreen(element, svgPoint, screenX, screenY);
        }
        return Infinity;
    }
    
    getDistanceToPath(path, point) {
        // First check if point is directly on the path
        // Note: isPointInStroke uses local coordinates, so we need to transform the point
        if (path.isPointInStroke) {
            const pathCTM = path.getCTM();
            if (pathCTM) {
                const localPoint = this.svgElement.createSVGPoint();
                localPoint.x = point.x;
                localPoint.y = point.y;
                const localPointTransformed = localPoint.matrixTransform(pathCTM.inverse());
                if (path.isPointInStroke(localPointTransformed)) {
                    return 0;
                }
            }
        }
        
        // Calculate distance to the path
        return this.calculateDistanceToPath(path, point);
    }
    
    calculateDistanceToPath(path, point) {
        // Sample points along the path and find minimum distance
        const pathLength = path.getTotalLength();
        if (pathLength === 0) return Infinity;
        
        // Get the path's transform matrix to convert local coordinates to SVG coordinates
        const pathCTM = path.getCTM();
        if (!pathCTM) return Infinity;
        
        let minDistance = Infinity;
        const samples = Math.max(50, Math.floor(pathLength / 2)); // Sample every 2 pixels or at least 50 points
        
        for (let i = 0; i <= samples; i++) {
            const len = (pathLength * i) / samples;
            const pathPointLocal = path.getPointAtLength(len);
            
            // Transform path point from local coordinates to SVG coordinates
            const pathPointSVG = this.svgElement.createSVGPoint();
            pathPointSVG.x = pathPointLocal.x;
            pathPointSVG.y = pathPointLocal.y;
            const pathPoint = pathPointSVG.matrixTransform(pathCTM);
            
            const dx = pathPoint.x - point.x;
            const dy = pathPoint.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }
    
    getDistanceToPathScreen(path, svgPoint, screenX, screenY) {
        // Sample points along the path and find minimum distance in screen coordinates
        const pathLength = path.getTotalLength();
        if (pathLength === 0) return Infinity;
        
        let minDistance = Infinity;
        const samples = Math.max(50, Math.floor(pathLength / 2));
        
        for (let i = 0; i <= samples; i++) {
            const len = (pathLength * i) / samples;
            const pathPointLocal = path.getPointAtLength(len);
            
            // Transform path point to screen coordinates
            const pathPointSVG = this.svgElement.createSVGPoint();
            pathPointSVG.x = pathPointLocal.x;
            pathPointSVG.y = pathPointLocal.y;
            const pathPointScreen = pathPointSVG.matrixTransform(path.getScreenCTM());
            
            const dx = pathPointScreen.x - screenX;
            const dy = pathPointScreen.y - screenY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }
    
    getDistanceToLine(line, point) {
        const x1 = parseFloat(line.getAttribute('x1')) || 0;
        const y1 = parseFloat(line.getAttribute('y1')) || 0;
        const x2 = parseFloat(line.getAttribute('x2')) || 0;
        const y2 = parseFloat(line.getAttribute('y2')) || 0;
        
        // Transform line endpoints from local coordinates to SVG coordinates
        const lineCTM = line.getCTM();
        if (!lineCTM) return Infinity;
        
        const p1 = this.svgElement.createSVGPoint();
        p1.x = x1;
        p1.y = y1;
        const p1SVG = p1.matrixTransform(lineCTM);
        
        const p2 = this.svgElement.createSVGPoint();
        p2.x = x2;
        p2.y = y2;
        const p2SVG = p2.matrixTransform(lineCTM);
        
        return this.distanceToLineSegment(point.x, point.y, p1SVG.x, p1SVG.y, p2SVG.x, p2SVG.y);
    }
    
    getDistanceToLineScreen(line, svgPoint, screenX, screenY) {
        const x1 = parseFloat(line.getAttribute('x1')) || 0;
        const y1 = parseFloat(line.getAttribute('y1')) || 0;
        const x2 = parseFloat(line.getAttribute('x2')) || 0;
        const y2 = parseFloat(line.getAttribute('y2')) || 0;
        
        // Transform line endpoints to screen coordinates
        const p1 = this.svgElement.createSVGPoint();
        p1.x = x1;
        p1.y = y1;
        const p1Screen = p1.matrixTransform(line.getScreenCTM());
        
        const p2 = this.svgElement.createSVGPoint();
        p2.x = x2;
        p2.y = y2;
        const p2Screen = p2.matrixTransform(line.getScreenCTM());
        
        return this.distanceToLineSegment(screenX, screenY, p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
    }
    
    getDistanceToPolyline(polyline, point) {
        const pointsAttr = polyline.getAttribute('points');
        if (!pointsAttr) return Infinity;
        
        const points = pointsAttr.trim().split(/[\s,]+/).map(parseFloat);
        let minDistance = Infinity;
        
        // Transform polyline points from local coordinates to SVG coordinates
        const polylineCTM = polyline.getCTM();
        if (!polylineCTM) return Infinity;
        
        for (let i = 0; i < points.length - 2; i += 2) {
            const p1 = this.svgElement.createSVGPoint();
            p1.x = points[i];
            p1.y = points[i + 1];
            const p1SVG = p1.matrixTransform(polylineCTM);
            
            const p2 = this.svgElement.createSVGPoint();
            p2.x = points[i + 2];
            p2.y = points[i + 3];
            const p2SVG = p2.matrixTransform(polylineCTM);
            
            const distance = this.distanceToLineSegment(point.x, point.y, p1SVG.x, p1SVG.y, p2SVG.x, p2SVG.y);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        // For polygons, also check the closing segment
        if (polyline.tagName === 'polygon' && points.length >= 4) {
            const p1 = this.svgElement.createSVGPoint();
            p1.x = points[points.length - 2];
            p1.y = points[points.length - 1];
            const p1SVG = p1.matrixTransform(polylineCTM);
            
            const p2 = this.svgElement.createSVGPoint();
            p2.x = points[0];
            p2.y = points[1];
            const p2SVG = p2.matrixTransform(polylineCTM);
            
            const distance = this.distanceToLineSegment(point.x, point.y, p1SVG.x, p1SVG.y, p2SVG.x, p2SVG.y);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }
    
    getDistanceToPolylineScreen(polyline, svgPoint, screenX, screenY) {
        const pointsAttr = polyline.getAttribute('points');
        if (!pointsAttr) return Infinity;
        
        const points = pointsAttr.trim().split(/[\s,]+/).map(parseFloat);
        let minDistance = Infinity;
        
        // Transform polyline points to screen coordinates
        const polylineScreenCTM = polyline.getScreenCTM();
        if (!polylineScreenCTM) return Infinity;
        
        for (let i = 0; i < points.length - 2; i += 2) {
            const p1 = this.svgElement.createSVGPoint();
            p1.x = points[i];
            p1.y = points[i + 1];
            const p1Screen = p1.matrixTransform(polylineScreenCTM);
            
            const p2 = this.svgElement.createSVGPoint();
            p2.x = points[i + 2];
            p2.y = points[i + 3];
            const p2Screen = p2.matrixTransform(polylineScreenCTM);
            
            const distance = this.distanceToLineSegment(screenX, screenY, p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        // For polygons, also check the closing segment
        if (polyline.tagName === 'polygon' && points.length >= 4) {
            const p1 = this.svgElement.createSVGPoint();
            p1.x = points[points.length - 2];
            p1.y = points[points.length - 1];
            const p1Screen = p1.matrixTransform(polylineScreenCTM);
            
            const p2 = this.svgElement.createSVGPoint();
            p2.x = points[0];
            p2.y = points[1];
            const p2Screen = p2.matrixTransform(polylineScreenCTM);
            
            const distance = this.distanceToLineSegment(screenX, screenY, p1Screen.x, p1Screen.y, p2Screen.x, p2Screen.y);
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }
    
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        // Calculate distance from point to line segment
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            // Line segment is a point
            const dx2 = px - x1;
            const dy2 = py - y1;
            return Math.sqrt(dx2 * dx2 + dy2 * dy2);
        }
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        const dx2 = px - projX;
        const dy2 = py - projY;
        return Math.sqrt(dx2 * dx2 + dy2 * dy2);
    }
    
    parsePathData(pathData) {
        const commands = [];
        const regex = /([MmLlHhVvCcSsQqTtAaZz])\s*([^MmLlHhVvCcSsQqTtAaZz]*)/g;
        let match;

        // Track current absolute position for converting relative commands
        let currentX = 0;
        let currentY = 0;

        while ((match = regex.exec(pathData)) !== null) {
            const type = match[1];
            const isRelative = (type === type.toLowerCase());
            const coords = match[2].trim().split(/[\s,]+/).filter(s => s).map(parseFloat);
            
            if (type === 'M' || type === 'm') {
                for (let i = 0; i < coords.length; i += 2) {
                    let x = coords[i];
                    let y = coords[i + 1];
                    if (isRelative) {
                        x += currentX;
                        y += currentY;
                    }
                    currentX = x;
                    currentY = y;
                    commands.push({
                        type: 'M',
                        x,
                        y
                    });
                }
            } else if (type === 'L' || type === 'l') {
                for (let i = 0; i < coords.length; i += 2) {
                    let x = coords[i];
                    let y = coords[i + 1];
                    if (isRelative) {
                        x += currentX;
                        y += currentY;
                    }
                    currentX = x;
                    currentY = y;
                    commands.push({
                        type: 'L',
                        x,
                        y
                    });
                }
            } else if (type === 'C' || type === 'c') {
                for (let i = 0; i < coords.length; i += 6) {
                    let x1 = coords[i];
                    let y1 = coords[i + 1];
                    let x2 = coords[i + 2];
                    let y2 = coords[i + 3];
                    let x = coords[i + 4];
                    let y = coords[i + 5];
                    if (isRelative) {
                        x1 += currentX;
                        y1 += currentY;
                        x2 += currentX;
                        y2 += currentY;
                        x += currentX;
                        y += currentY;
                    }
                    currentX = x;
                    currentY = y;
                    commands.push({
                        type: 'C',
                        x1,
                        y1,
                        x2,
                        y2,
                        x,
                        y
                    });
                }
            } else if (type === 'Q' || type === 'q') {
                for (let i = 0; i < coords.length; i += 4) {
                    let x1 = coords[i];
                    let y1 = coords[i + 1];
                    let x = coords[i + 2];
                    let y = coords[i + 3];
                    if (isRelative) {
                        x1 += currentX;
                        y1 += currentY;
                        x += currentX;
                        y += currentY;
                    }
                    currentX = x;
                    currentY = y;
                    commands.push({
                        type: 'Q',
                        x1,
                        y1,
                        x,
                        y
                    });
                }
            } else if (type === 'Z' || type === 'z') {
                commands.push({ type: 'Z' });
            }
        }
        
        return commands;
    }
    
    moveElementCorner(element, cornerIndex, newXRoot, newYRoot) {
        // Convert from root SVG coordinates to element-local coordinates
        const local = this.toLocalCoords(element, newXRoot, newYRoot);
        
        if (element.tagName === 'rect') {
            const currentX = parseFloat(element.getAttribute('x')) || 0;
            const currentY = parseFloat(element.getAttribute('y')) || 0;
            const currentWidth = parseFloat(element.getAttribute('width')) || 0;
            const currentHeight = parseFloat(element.getAttribute('height')) || 0;
            
            let rectX = currentX;
            let rectY = currentY;
            let rectWidth = currentWidth;
            let rectHeight = currentHeight;
            
            // Adjust based on which corner is moved
            // Corner indices: 0 = top-left, 1 = top-right, 2 = bottom-right, 3 = bottom-left
            switch (cornerIndex) {
                case 0: // Top-left corner
                    rectWidth = (currentX + currentWidth) - local.x;
                    rectHeight = (currentY + currentHeight) - local.y;
                    rectX = local.x;
                    rectY = local.y;
                    break;
                case 1: // Top-right corner
                    rectWidth = local.x - currentX;
                    rectHeight = (currentY + currentHeight) - local.y;
                    rectX = currentX;
                    rectY = local.y;
                    break;
                case 2: // Bottom-right corner
                    rectWidth = local.x - currentX;
                    rectHeight = local.y - currentY;
                    rectX = currentX;
                    rectY = currentY;
                    break;
                case 3: // Bottom-left corner
                    rectWidth = (currentX + currentWidth) - local.x;
                    rectHeight = local.y - currentY;
                    rectX = local.x;
                    rectY = currentY;
                    break;
            }
            
            // Ensure width and height are positive
            if (rectWidth < 0) {
                rectX += rectWidth;
                rectWidth = Math.abs(rectWidth);
            }
            if (rectHeight < 0) {
                rectY += rectHeight;
                rectHeight = Math.abs(rectHeight);
            }
            
            // Only update if the values are valid
            if (rectWidth > 0 && rectHeight > 0) {
                element.setAttribute('x', rectX);
                element.setAttribute('y', rectY);
                element.setAttribute('width', rectWidth);
                element.setAttribute('height', rectHeight);
            }
        } else if (element.tagName === 'circle') {
            // For circles, corners represent points on the circumference
            // Moving a corner should resize the circle
            const currentCX = parseFloat(element.getAttribute('cx')) || 0;
            const currentCY = parseFloat(element.getAttribute('cy')) || 0;
            const currentR = parseFloat(element.getAttribute('r')) || 0;
            
            // Get current center in root coordinates
            const centerRoot = this.toRootCoords(element, currentCX, currentCY);
            
            // Calculate new radius as distance from center to new corner position
            const dx = newXRoot - centerRoot.x;
            const dy = newYRoot - centerRoot.y;
            const newR = Math.sqrt(dx * dx + dy * dy);
            
            if (newR > 0) {
                element.setAttribute('r', newR);
            }
        } else if (element.tagName === 'ellipse') {
            // For ellipses, corners represent points on the ellipse
            // This is more complex - for now, just adjust rx/ry proportionally
            const currentCX = parseFloat(element.getAttribute('cx')) || 0;
            const currentCY = parseFloat(element.getAttribute('cy')) || 0;
            const currentRX = parseFloat(element.getAttribute('rx')) || 0;
            const currentRY = parseFloat(element.getAttribute('ry')) || 0;
            
            // Get current center in root coordinates
            const centerRoot = this.toRootCoords(element, currentCX, currentCY);
            
            // Calculate distance from center
            const dx = newXRoot - centerRoot.x;
            const dy = newYRoot - centerRoot.y;
            
            // Adjust rx or ry based on which corner (simplified)
            // Corner 0: top-left -> decrease both
            // Corner 1: top-right -> increase rx, decrease ry
            // Corner 2: bottom-right -> increase both
            // Corner 3: bottom-left -> decrease rx, increase ry
            let newRX = currentRX;
            let newRY = currentRY;
            
            switch (cornerIndex) {
                case 0:
                    newRX = Math.abs(dx);
                    newRY = Math.abs(dy);
                    break;
                case 1:
                    newRX = Math.abs(dx);
                    newRY = Math.abs(dy);
                    break;
                case 2:
                    newRX = Math.abs(dx);
                    newRY = Math.abs(dy);
                    break;
                case 3:
                    newRX = Math.abs(dx);
                    newRY = Math.abs(dy);
                    break;
            }
            
            if (newRX > 0 && newRY > 0) {
                element.setAttribute('rx', newRX);
                element.setAttribute('ry', newRY);
            }
        }
        // Add more element types as needed
    }
    
    moveNode(element, commandIndex, x, y, pointType = null) {
        if (element.tagName !== 'path') return;
        
        const pathData = element.getAttribute('d');
        const commands = this.parsePathData(pathData);
        
        if (commandIndex >= commands.length) return;
        
        const cmd = commands[commandIndex];

        // Convert from root SVG coords back into element-local coords, so that transforms on the path are respected
        const local = this.toLocalCoords(element, x, y);
        
        // Determine which point to move based on pointType parameter or currentDraggedNode
        let controlPoint = null;
        if (pointType === 'control1') {
            controlPoint = 1;
        } else if (pointType === 'control2') {
            controlPoint = 2;
        } else if (this.currentDraggedNode && this.currentDraggedNode.controlPoint === 1) {
            controlPoint = 1;
        } else if (this.currentDraggedNode && this.currentDraggedNode.controlPoint === 2) {
            controlPoint = 2;
        }
        
        if (controlPoint === 1) {
            cmd.x1 = local.x;
            cmd.y1 = local.y;
        } else if (controlPoint === 2) {
            cmd.x2 = local.x;
            cmd.y2 = local.y;
        } else {
            cmd.x = local.x;
            cmd.y = local.y;
        }
        
        // Rebuild path data
        const newPathData = this.buildPathData(commands);
        element.setAttribute('d', newPathData);
        
        // Update handles
        this.showNodeHandles(element);
    }
    
    buildPathData(commands) {
        let pathData = '';
        
        commands.forEach(cmd => {
            if (cmd.type === 'M') {
                pathData += `M ${cmd.x} ${cmd.y} `;
            } else if (cmd.type === 'L') {
                pathData += `L ${cmd.x} ${cmd.y} `;
            } else if (cmd.type === 'C') {
                pathData += `C ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y} `;
            } else if (cmd.type === 'Q') {
                pathData += `Q ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y} `;
            } else if (cmd.type === 'Z') {
                pathData += 'Z ';
            }
        });
        
        return pathData.trim();
    }
    
    saveSVG() {
        if (!this.svgElement) {
            alert('No SVG loaded');
            return;
        }
        
        // Clone SVG to avoid modifying the original
        const svgClone = this.svgElement.cloneNode(true);
        
        // Ensure SVG has proper namespace and attributes
        if (!svgClone.getAttribute('xmlns')) {
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgClone);
        
        // Create blob and download
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getSelectedProperties(){
        for (const path of this.selectedElements) {
            console.log("length: ", path.getTotalLength()); //get the length of the path
            console.log("fill: ", path.getAttribute('fill')); //get the fill color of the path
            console.log("stroke: ", path.getAttribute('stroke')); //get the stroke color of the path
            console.log("stroke-width: ", path.getAttribute('stroke-width')); //get the stroke width of the path
            console.log("opacity: ", path.getAttribute('opacity')); //get the opacity of the path
          }
    }

    logAllAttributes() {
        if (this.selectedElements.size === 0) {
            console.log("No elements selected");
            return;
        }

        this.selectedElements.forEach((element, index) => {
            console.log(`\n=== Element ${index + 1} (${element.tagName}) ===`);
            
            // Get all attribute names
            const attributeNames = element.getAttributeNames();
            
            if (attributeNames.length === 0) {
                console.log("No attributes found");
            } else {
                // Create an object with all attributes
                const attributes = {};
                attributeNames.forEach(attrName => {
                    attributes[attrName] = element.getAttribute(attrName);
                });
                
                // Log the attributes object for easy inspection
                console.log("All attributes:", attributes);
                
                // Also log each attribute individually for clarity
                attributeNames.forEach(attrName => {
                    console.log(`  ${attrName}: ${element.getAttribute(attrName)}`);
                });
            }
        });
    }
    
    setupTransformPanel() {
        const transformButton = document.getElementById('transformToolButton');
        const transformPanel = document.getElementById('transformPanel');
        const transformPanelClose = document.getElementById('transformPanelClose');
        const transformUnitSelect = document.getElementById('transformUnit');
        
        // Set initial unit from saved preference
        transformUnitSelect.value = this.transformUnit;
        
        // Update unit labels when unit changes
        transformUnitSelect.addEventListener('change', (e) => {
            this.transformUnit = e.target.value;
            localStorage.setItem('svgEditorTransformUnit', this.transformUnit);
            this.updateTransformPanel();
        });
        
        // Toggle transform panel when button is clicked
        transformButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = transformPanel.classList.contains('active');
            if (isActive) {
                transformPanel.classList.remove('active');
                transformButton.classList.remove('active');
            } else {
                transformPanel.classList.add('active');
                transformButton.classList.add('active');
                // Update the panel with current selection
                this.updateTransformPanel();
            }
        });
        
        // Close panel when close button is clicked
        transformPanelClose.addEventListener('click', (e) => {
            e.stopPropagation();
            transformPanel.classList.remove('active');
            transformButton.classList.remove('active');
        });
        
        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.toolbar-panel')) {
                transformPanel.classList.remove('active');
                transformButton.classList.remove('active');
            }
        });
        
        // Handle scale input changes - only apply on blur or Enter key
        const scaleInput = document.getElementById('transformScale');
        scaleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.isUpdatingScaleInput) return;
                e.preventDefault();
                // Blur the input after applying
                e.target.blur();
            }
        });
        
        // Apply scale on blur (when input loses focus)
        scaleInput.addEventListener('blur', (e) => {
            if (this.isUpdatingScaleInput) return;
            const scalePercent = parseFloat(e.target.value);
            if (!isNaN(scalePercent) && scalePercent > 0) {
                this.applyScaleFromInput(scalePercent / 100);
            }
        });
    }
    
    updateTransformPanel() {
        const transformPanel = document.getElementById('transformPanel');
        const widthInput = document.getElementById('transformWidth');
        const heightInput = document.getElementById('transformHeight');
        const scaleInput = document.getElementById('transformScale');
        const widthUnitLabel = document.getElementById('transformWidthUnit');
        const heightUnitLabel = document.getElementById('transformHeightUnit');
        
        // Update unit labels
        const unitLabel = this.getUnitLabel(this.transformUnit);
        widthUnitLabel.textContent = unitLabel;
        heightUnitLabel.textContent = unitLabel;
        
        // Only update if panel is visible
        if (!transformPanel.classList.contains('active')) {
            return;
        }
        
        if (this.selectedElements.size === 0) {
            widthInput.value = '';
            heightInput.value = '';
            scaleInput.value = '';
            return;
        }
        
        // Don't update scale input if it's currently focused (user is typing)
        // Since we're modifying coordinates directly, there's no transform-based scale to display
        // The scale input is user-editable, so we preserve whatever the user typed
        if (document.activeElement !== scaleInput) {
            this.isUpdatingScaleInput = true;
            try {
                if (this.selectedElements.size === 1) {
                    // Since coordinates are modified directly, there's no scale transform
                    // Only update if the field is empty (initial load)
                    if (!scaleInput.value || scaleInput.value === '') {
                        scaleInput.value = '100.0';
                    }
                } else {
                    // For multiple elements, clear it
                    scaleInput.value = '';
                }
            } finally {
                this.isUpdatingScaleInput = false;
            }
        }
        
        // If multiple elements selected, calculate combined bounding box
        if (this.selectedElements.size === 1) {
            // Single element - get its bounding box
            const element = Array.from(this.selectedElements)[0];
            try {
                const bbox = element.getBBox();
                const widthPx = bbox.width;
                const heightPx = bbox.height;
                
                // Convert to selected unit
                const width = this.convertPixels(widthPx, this.transformUnit);
                const height = this.convertPixels(heightPx, this.transformUnit);
                
                widthInput.value = width.toFixed(2);
                heightInput.value = height.toFixed(2);
            } catch (e) {
                // Element might not be in the DOM or might not support getBBox
                widthInput.value = '';
                heightInput.value = '';
            }
        } else {
            // Multiple elements - calculate combined bounding box
            try {
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                this.selectedElements.forEach(element => {
                    try {
                        const bbox = element.getBBox();
                        minX = Math.min(minX, bbox.x);
                        minY = Math.min(minY, bbox.y);
                        maxX = Math.max(maxX, bbox.x + bbox.width);
                        maxY = Math.max(maxY, bbox.y + bbox.height);
                    } catch (e) {
                        // Skip elements that don't support getBBox
                    }
                });
                
                if (minX !== Infinity && minY !== Infinity) {
                    const widthPx = maxX - minX;
                    const heightPx = maxY - minY;
                    
                    // Convert to selected unit
                    const width = this.convertPixels(widthPx, this.transformUnit);
                    const height = this.convertPixels(heightPx, this.transformUnit);
                    
                    widthInput.value = width.toFixed(2);
                    heightInput.value = height.toFixed(2);
                } else {
                    widthInput.value = '';
                    heightInput.value = '';
                }
            } catch (e) {
                widthInput.value = '';
                heightInput.value = '';
            }
        }
    }
    
    applyScaleFromInput(scaleFactor) {
        if (this.selectedElements.size === 0) return;
        
        // Apply scale to all selected elements by modifying coordinates directly
        this.selectedElements.forEach(element => {
            // Temporarily remove transform to get untransformed bounding box and center
            
            let centerX, centerY;
                
            // Get bounding box in untransformed local coordinates
            const bbox = element.getBBox();
            centerX = bbox.x + bbox.width / 2;
            centerY = bbox.y + bbox.height / 2;
           
            
            // Handle different element types
            const tagName = element.tagName.toLowerCase();
            
            // Use uniform scaling for transform panel input
            this.scaleElementCoordinates(element, centerX, centerY, scaleFactor, scaleFactor);
            
            // Remove transform since we've scaled the coordinates directly
            //element.removeAttribute('transform');
        });
        
        // Update bounding box and panel display
        this.updateBoundingBox();
        this.updateTransformPanel();
    }
    
    saveElementData(element) {
        // Save the original element data for restoring before scaling
        const tagName = element.tagName.toLowerCase();
        const data = { tagName, transform: element.getAttribute('transform') || '' };
        
        switch (tagName) {
            case 'path':
                data.d = element.getAttribute('d') || '';
                break;
            case 'rect':
                data.x = element.getAttribute('x') || '0';
                data.y = element.getAttribute('y') || '0';
                data.width = element.getAttribute('width') || '0';
                data.height = element.getAttribute('height') || '0';
                break;
            case 'circle':
                data.cx = element.getAttribute('cx') || '0';
                data.cy = element.getAttribute('cy') || '0';
                data.r = element.getAttribute('r') || '0';
                break;
            case 'ellipse':
                data.cx = element.getAttribute('cx') || '0';
                data.cy = element.getAttribute('cy') || '0';
                data.rx = element.getAttribute('rx') || '0';
                data.ry = element.getAttribute('ry') || '0';
                break;
            case 'line':
                data.x1 = element.getAttribute('x1') || '0';
                data.y1 = element.getAttribute('y1') || '0';
                data.x2 = element.getAttribute('x2') || '0';
                data.y2 = element.getAttribute('y2') || '0';
                break;
            case 'polyline':
            case 'polygon':
                data.points = element.getAttribute('points') || '';
                break;
            case 'text':
                data.x = element.getAttribute('x') || '';
                data.y = element.getAttribute('y') || '';
                data.fontSize = element.getAttribute('font-size') || '';
                break;
        }
        
        return data;
    }
    
    restoreElementData(element, data) {
        // Restore element to original state before scaling
        if (data.transform !== undefined) {
            if (data.transform) {
                element.setAttribute('transform', data.transform);
            } else {
                element.removeAttribute('transform');
            }
        }
        
        switch (data.tagName) {
            case 'path':
                if (data.d !== undefined) element.setAttribute('d', data.d);
                break;
            case 'rect':
                if (data.x !== undefined) element.setAttribute('x', data.x);
                if (data.y !== undefined) element.setAttribute('y', data.y);
                if (data.width !== undefined) element.setAttribute('width', data.width);
                if (data.height !== undefined) element.setAttribute('height', data.height);
                break;
            case 'circle':
                if (data.cx !== undefined) element.setAttribute('cx', data.cx);
                if (data.cy !== undefined) element.setAttribute('cy', data.cy);
                if (data.r !== undefined) element.setAttribute('r', data.r);
                break;
            case 'ellipse':
                if (data.cx !== undefined) element.setAttribute('cx', data.cx);
                if (data.cy !== undefined) element.setAttribute('cy', data.cy);
                if (data.rx !== undefined) element.setAttribute('rx', data.rx);
                if (data.ry !== undefined) element.setAttribute('ry', data.ry);
                break;
            case 'line':
                if (data.x1 !== undefined) element.setAttribute('x1', data.x1);
                if (data.y1 !== undefined) element.setAttribute('y1', data.y1);
                if (data.x2 !== undefined) element.setAttribute('x2', data.x2);
                if (data.y2 !== undefined) element.setAttribute('y2', data.y2);
                break;
            case 'polyline':
            case 'polygon':
                if (data.points !== undefined) element.setAttribute('points', data.points);
                break;
            case 'text':
                if (data.x !== undefined) element.setAttribute('x', data.x);
                if (data.y !== undefined) element.setAttribute('y', data.y);
                if (data.fontSize !== undefined) {
                    if (data.fontSize) {
                        element.setAttribute('font-size', data.fontSize);
                    } else {
                        element.removeAttribute('font-size');
                    }
                }
                break;
        }
    }
    
    scaleElementCoordinates(element, centerX, centerY, scaleX, scaleY) {
        // Route to appropriate scaling function based on element type
        const tagName = element.tagName.toLowerCase();
        
        switch (tagName) {
            case 'path':
                this.scalePath(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'rect':
                this.scaleRect(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'circle':
                this.scaleCircle(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'ellipse':
                this.scaleEllipse(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'line':
                this.scaleLine(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'polyline':
            case 'polygon':
                this.scalePolyline(element, centerX, centerY, scaleX, scaleY);
                break;
            case 'text':
                this.scaleText(element, centerX, centerY, scaleX, scaleY);
                break;
            default:
                // Unsupported element type
                return;
        }
    }
    
    scalePath(element, centerX, centerY, scaleX, scaleY) {
        const pathData = element.getAttribute('d');
        if (!pathData) return;
        
        const commands = this.parsePathData(pathData);
        
        // Scale all coordinates about the center
        commands.forEach(cmd => {
            if (cmd.type === 'M' || cmd.type === 'L') {
                cmd.x = centerX + (cmd.x - centerX) * scaleX;
                cmd.y = centerY + (cmd.y - centerY) * scaleY;
            } else if (cmd.type === 'C') {
                cmd.x1 = centerX + (cmd.x1 - centerX) * scaleX;
                cmd.y1 = centerY + (cmd.y1 - centerY) * scaleY;
                cmd.x2 = centerX + (cmd.x2 - centerX) * scaleX;
                cmd.y2 = centerY + (cmd.y2 - centerY) * scaleY;
                cmd.x = centerX + (cmd.x - centerX) * scaleX;
                cmd.y = centerY + (cmd.y - centerY) * scaleY;
            } else if (cmd.type === 'Q') {
                cmd.x1 = centerX + (cmd.x1 - centerX) * scaleX;
                cmd.y1 = centerY + (cmd.y1 - centerY) * scaleY;
                cmd.x = centerX + (cmd.x - centerX) * scaleX;
                cmd.y = centerY + (cmd.y - centerY) * scaleY;
            }
        });
        
        const newPathData = this.buildPathData(commands);
        element.setAttribute('d', newPathData);
    }
    
    scaleRect(element, centerX, centerY, scaleX, scaleY) {
        const x = parseFloat(element.getAttribute('x') || 0);
        const y = parseFloat(element.getAttribute('y') || 0);
        const width = parseFloat(element.getAttribute('width') || 0);
        const height = parseFloat(element.getAttribute('height') || 0);
        
        // Scale position and size
        const newX = centerX + (x - centerX) * scaleX;
        const newY = centerY + (y - centerY) * scaleY;
        const newWidth = width * scaleX;
        const newHeight = height * scaleY;
        
        element.setAttribute('x', newX);
        element.setAttribute('y', newY);
        element.setAttribute('width', newWidth);
        element.setAttribute('height', newHeight);
    }
    
    scaleCircle(element, centerX, centerY, scaleX, scaleY) {
        const cx = parseFloat(element.getAttribute('cx') || 0);
        const cy = parseFloat(element.getAttribute('cy') || 0);
        const r = parseFloat(element.getAttribute('r') || 0);
        
        // For circles, use average of scaleX and scaleY to maintain circular shape
        const avgScale = (scaleX + scaleY) / 2;
        
        // Scale center position and radius
        const newCx = centerX + (cx - centerX) * scaleX;
        const newCy = centerY + (cy - centerY) * scaleY;
        const newR = r * avgScale;
        
        element.setAttribute('cx', newCx);
        element.setAttribute('cy', newCy);
        element.setAttribute('r', newR);
    }
    
    scaleEllipse(element, centerX, centerY, scaleX, scaleY) {
        const cx = parseFloat(element.getAttribute('cx') || 0);
        const cy = parseFloat(element.getAttribute('cy') || 0);
        const rx = parseFloat(element.getAttribute('rx') || 0);
        const ry = parseFloat(element.getAttribute('ry') || 0);
        
        // Scale center position and radii
        const newCx = centerX + (cx - centerX) * scaleX;
        const newCy = centerY + (cy - centerY) * scaleY;
        const newRx = rx * scaleX;
        const newRy = ry * scaleY;
        
        element.setAttribute('cx', newCx);
        element.setAttribute('cy', newCy);
        element.setAttribute('rx', newRx);
        element.setAttribute('ry', newRy);
    }
    
    scaleLine(element, centerX, centerY, scaleX, scaleY) {
        const x1 = parseFloat(element.getAttribute('x1') || 0);
        const y1 = parseFloat(element.getAttribute('y1') || 0);
        const x2 = parseFloat(element.getAttribute('x2') || 0);
        const y2 = parseFloat(element.getAttribute('y2') || 0);
        
        // Scale both endpoints about the center
        const newX1 = centerX + (x1 - centerX) * scaleX;
        const newY1 = centerY + (y1 - centerY) * scaleY;
        const newX2 = centerX + (x2 - centerX) * scaleX;
        const newY2 = centerY + (y2 - centerY) * scaleY;
        
        element.setAttribute('x1', newX1);
        element.setAttribute('y1', newY1);
        element.setAttribute('x2', newX2);
        element.setAttribute('y2', newY2);
    }
    
    scalePolyline(element, centerX, centerY, scaleX, scaleY) {
        const pointsAttr = element.getAttribute('points');
        if (!pointsAttr) return;
        
        // Parse points: "x1,y1 x2,y2" or "x1 y1 x2 y2" format
        const points = pointsAttr.trim().split(/[\s,]+/).map(parseFloat);
        const scaledPoints = [];
        
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i];
            const y = points[i + 1];
            if (isNaN(x) || isNaN(y)) continue;
            
            const newX = centerX + (x - centerX) * scaleX;
            const newY = centerY + (y - centerY) * scaleY;
            scaledPoints.push(newX, newY);
        }
        
        // Rebuild points string in "x,y x,y" format
        const newPoints = [];
        for (let i = 0; i < scaledPoints.length; i += 2) {
            newPoints.push(`${scaledPoints[i]},${scaledPoints[i + 1]}`);
        }
        element.setAttribute('points', newPoints.join(' '));
    }
    
    scaleText(element, centerX, centerY, scaleX, scaleY) {
        // Scale x and y position attributes
        const xAttr = element.getAttribute('x');
        const yAttr = element.getAttribute('y');
        
        if (xAttr !== null) {
            const xValues = xAttr.split(/[\s,]+/).map(val => {
                const x = parseFloat(val);
                if (isNaN(x)) return val;
                return centerX + (x - centerX) * scaleX;
            });
            element.setAttribute('x', xValues.join(' '));
        }
        
        if (yAttr !== null) {
            const yValues = yAttr.split(/[\s,]+/).map(val => {
                const y = parseFloat(val);
                if (isNaN(y)) return val;
                return centerY + (y - centerY) * scaleY;
            });
            element.setAttribute('y', yValues.join(' '));
        }
        
        // Also scale font-size if present (use average scale for font size)
        const fontSize = element.getAttribute('font-size');
        if (fontSize) {
            const size = parseFloat(fontSize);
            if (!isNaN(size)) {
                const avgScale = (scaleX + scaleY) / 2;
                element.setAttribute('font-size', size * avgScale);
            }
        }
    }
    
    setupSettingsDialog() {
        const settingsDialog = document.getElementById('settingsDialog');
        const settingsDialogClose = document.getElementById('settingsDialogClose');
        const settingsCancelBtn = document.getElementById('settingsCancelBtn');
        const settingsSaveBtn = document.getElementById('settingsSaveBtn');
        const dpiInput = document.getElementById('dpiInput');
        const arrowKeyIncrementInput = document.getElementById('arrowKeyIncrement');
        const shiftArrowKeyIncrementInput = document.getElementById('shiftArrowKeyIncrement');
        
        // Close dialog handlers
        const closeDialog = () => {
            settingsDialog.style.display = 'none';
        };
        
        settingsDialogClose.addEventListener('click', closeDialog);
        settingsCancelBtn.addEventListener('click', closeDialog);
        
        // Close on overlay click
        settingsDialog.addEventListener('click', (e) => {
            if (e.target === settingsDialog) {
                closeDialog();
            }
        });
        
        // Save settings
        settingsSaveBtn.addEventListener('click', () => {
            const dpi = parseFloat(dpiInput.value);
            const arrowIncrement = parseFloat(arrowKeyIncrementInput.value);
            const shiftArrowIncrement = parseFloat(shiftArrowKeyIncrementInput.value);
            
            let isValid = true;
            let errorMessage = '';
            
            if (!dpi || dpi <= 0 || dpi > 600) {
                isValid = false;
                errorMessage = 'Please enter a valid DPI value between 1 and 600';
            } else if (!arrowIncrement || arrowIncrement < 0.1) {
                isValid = false;
                errorMessage = 'Please enter a valid Arrow Key Increment (minimum 0.1)';
            } else if (!shiftArrowIncrement || shiftArrowIncrement < 0.1) {
                isValid = false;
                errorMessage = 'Please enter a valid Shift+Arrow Key Increment (minimum 0.1)';
            }
            
            if (isValid) {
                this.dpi = dpi;
                this.arrowKeyIncrement = arrowIncrement;
                this.shiftArrowKeyIncrement = shiftArrowIncrement;
                
                localStorage.setItem('svgEditorDPI', dpi.toString());
                localStorage.setItem('svgEditorArrowKeyIncrement', arrowIncrement.toString());
                localStorage.setItem('svgEditorShiftArrowKeyIncrement', shiftArrowIncrement.toString());
                
                closeDialog();
                // Update transform panel if it's open
                this.updateTransformPanel();
            } else {
                alert(errorMessage);
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && settingsDialog.style.display !== 'none') {
                closeDialog();
            }
        });
    }
    
    openSettingsDialog() {
        const settingsDialog = document.getElementById('settingsDialog');
        const dpiInput = document.getElementById('dpiInput');
        const arrowKeyIncrementInput = document.getElementById('arrowKeyIncrement');
        const shiftArrowKeyIncrementInput = document.getElementById('shiftArrowKeyIncrement');
        
        dpiInput.value = this.dpi;
        arrowKeyIncrementInput.value = this.arrowKeyIncrement;
        shiftArrowKeyIncrementInput.value = this.shiftArrowKeyIncrement;
        
        settingsDialog.style.display = 'flex';
        dpiInput.focus();
        dpiInput.select();
    }
    
    // Conversion functions
    pixelsToInches(pixels) {
        return pixels / this.dpi;
    }
    
    pixelsToMillimeters(pixels) {
        // 1 inch = 25.4 mm
        return (pixels / this.dpi) * 25.4;
    }
    
    convertPixels(pixels, unit) {
        switch (unit) {
            case 'px':
                return pixels;
            case 'in':
                return this.pixelsToInches(pixels);
            case 'mm':
                return this.pixelsToMillimeters(pixels);
            default:
                return pixels;
        }
    }
    
    getUnitLabel(unit) {
        switch (unit) {
            case 'px':
                return 'px';
            case 'in':
                return 'in';
            case 'mm':
                return 'mm';
            default:
                return 'px';
        }
    }
    
    createBoundingBoxOverlay() {
        if (!this.svgElement) return;
        
        // Create a group inside the SVG for the bounding box
        // This ensures it's positioned correctly and doesn't block other elements
        const bboxGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        bboxGroup.id = 'boundingBoxGroup';
        bboxGroup.setAttribute('class', 'bounding-box-group');
        bboxGroup.style.pointerEvents = 'none';
        
        // Append to SVG (at the end so it's on top)
        this.svgElement.appendChild(bboxGroup);
        
        this.boundingBoxOverlay = bboxGroup;
    }
    
    updateBoundingBox() {
        if (!this.boundingBoxOverlay || !this.svgElement) return;
        
        // Clear existing bounding box
        this.boundingBoxOverlay.innerHTML = '';
        
        if (this.selectedElements.size === 0) {
            return;
        }
        
        // Calculate combined bounding box in SVG root coordinates
        // Convert each element's bounding box corners to root coordinates (like node handles do)
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.selectedElements.forEach(element => {
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
                    const rootCoords = this.toRootCoords(element, corner.x, corner.y);
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
                this.handleBoundingBoxHandleDown(e, pos.type);
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
            this.handleBoundingBoxHandleDown(e, 'rotate');
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
    }
    
    handleBoundingBoxHandleDown(e, handleType) {
        if (this.currentTool !== 'select' || this.selectedElements.size === 0) return;
        
        e.stopPropagation();
        e.preventDefault();
        
        this.isTransforming = true;
        this.transformHandle = handleType;
        
        // Store initial mouse position and bounding box
        const point = this.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
        
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
        
        this.selectedElements.forEach(element => {
            this.transformStartStates.set(element, this.getElementTransform(element));
            
            // Store original element data for coordinate-level scaling
            // This prevents scaling from compounding on each mouse move
            this.transformStartElementData.set(element, this.saveElementData(element));
            
            // Get the center point in element's local (untransformed) coordinate space
            // Use getBBox() which returns coordinates in the element's local space
            try {
                const bbox = element.getBBox();
                const centerLocalX = bbox.x + bbox.width / 2;
                const centerLocalY = bbox.y + bbox.height / 2;
                this.transformStartCenters.set(element, { x: centerLocalX, y: centerLocalY });
            } catch (e) {
                // Fallback: convert from root coordinates using initial transform state
                // Create a temporary point to convert coordinates
                const point = this.svgElement.createSVGPoint();
                point.x = centerRootX;
                point.y = centerRootY;
                
                // Get element's screen CTM at the start (before any transforms during this operation)
                const elemScreenCTM = element.getScreenCTM();
                const rootScreenCTM = this.svgElement.getScreenCTM();
                if (elemScreenCTM && rootScreenCTM) {
                    // root user -> screen
                    const screenPt = point.matrixTransform(rootScreenCTM);
                    // screen -> local (using initial transform state)
                    const localPt = screenPt.matrixTransform(elemScreenCTM.inverse());
                    this.transformStartCenters.set(element, { x: localPt.x, y: localPt.y });
                } else {
                    // Last resort: use root coordinates
                    this.transformStartCenters.set(element, { x: centerRootX, y: centerRootY });
                }
            }
        });
    }
    
    handleBoundingBoxTransform(e) {
        if (!this.isTransforming || !this.transformHandle || !this.boundingBox) return;
        
        // Convert mouse position to SVG root coordinates
        const point = this.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
        
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
            this.selectedElements.forEach(element => {
                // Use the stored center point in element-local coordinates (untransformed)
                const centerLocal = this.transformStartCenters.get(element) || { x: centerRootX, y: centerRootY };
                
                // Get initial transform state
                const initialTransform = this.transformStartStates.get(element) || {};
                const initialRotation = initialTransform.rotation || 0;
                
                // Calculate new rotation relative to initial state
                const newRotation = initialRotation + angleDeg;
                
                // Get other transform values to preserve them
                const currentTransform = this.getElementTransform(element);
                
                // Apply rotation about the center point (in element-local coords)
                this.setElementTransform(element, {
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
            
            // Apply scaling to all selected elements using coordinate-level scaling
            // This uses the same function as the transform panel input
            this.selectedElements.forEach(element => {
                // Restore to original state before scaling to prevent compounding
                const originalData = this.transformStartElementData.get(element);
                if (originalData) {
                    this.restoreElementData(element, originalData);
                }
                
                // Get the center point in element's local coordinates (from original state)
                let centerLocal = this.transformStartCenters.get(element);
                
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
                
                // Use the coordinate-level scaling function (same as transform panel)
                // This preserves existing transforms and scales coordinates directly
                // Scale from original state, not from current (already scaled) state
                this.scaleElementCoordinates(element, centerLocal.x, centerLocal.y, scaleX, scaleY);
            });
        }
        
        // Update bounding box display
        this.updateBoundingBox();
        this.updateTransformPanel();
    }
    
    rotatePoint(x, y, cx, cy, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = x - cx;
        const dy = y - cy;
        return {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos
        };
    }
    
    getElementTransform(element) {
        const transform = element.getAttribute('transform') || '';
        const translateMatch = transform.match(/translate\(([^,]+),([^)]+)\)/);
        const rotateMatch = transform.match(/rotate\(([^,\s)]+)(?:,\s*([^,\s)]+),\s*([^)\s)]+))?\)/);
        const scaleMatch = transform.match(/scale\(([^,\s)]+)(?:,\s*([^)\s)]+))?\)/);
        
        return {
            x: translateMatch ? parseFloat(translateMatch[1]) : 0,
            y: translateMatch ? parseFloat(translateMatch[2]) : 0,
            rotation: rotateMatch ? parseFloat(rotateMatch[1]) : 0,
            rotationCenterX: rotateMatch && rotateMatch[2] ? parseFloat(rotateMatch[2]) : undefined,
            rotationCenterY: rotateMatch && rotateMatch[3] ? parseFloat(rotateMatch[3]) : undefined,
            scaleX: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
            scaleY: scaleMatch && scaleMatch[2] ? parseFloat(scaleMatch[2]) : (scaleMatch ? parseFloat(scaleMatch[1]) : 1)
        };
    }
    
    setElementTransform(element, transform) {
        let transformStr = '';
        
        // Build transform string in correct order: translate, rotate, scale
        // This ensures transforms are applied in the right sequence
        
        // Translation
        if (transform.x !== undefined || transform.y !== undefined) {
            transformStr += `translate(${transform.x || 0}, ${transform.y || 0}) `;
        }
        
        // Rotation (with optional center point)
        if (transform.rotation !== undefined && transform.rotation !== 0) {
            if (transform.rotationCenterX !== undefined && transform.rotationCenterY !== undefined) {
                transformStr += `rotate(${transform.rotation}, ${transform.rotationCenterX}, ${transform.rotationCenterY}) `;
            } else {
                transformStr += `rotate(${transform.rotation}) `;
            }
        }
        
        // Scale (with optional center point via translate before/after)
        if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
            const scaleX = transform.scaleX !== undefined ? transform.scaleX : 1;
            const scaleY = transform.scaleY !== undefined ? transform.scaleY : 1;
            
            if (transform.scaleCenterX !== undefined && transform.scaleCenterY !== undefined) {
                // Scale about a point: translate(-cx, -cy) scale(sx, sy) translate(cx, cy)
                transformStr += `translate(${-transform.scaleCenterX}, ${-transform.scaleCenterY}) `;
                transformStr += `scale(${scaleX}, ${scaleY}) `;
                transformStr += `translate(${transform.scaleCenterX}, ${transform.scaleCenterY}) `;
            } else {
                transformStr += `scale(${scaleX}, ${scaleY}) `;
            }
        }
        
        element.setAttribute('transform', transformStr.trim());
    }
}

// Initialize the editor when the page loads
var activeEditor;
document.addEventListener('DOMContentLoaded', () => {
    activeEditor =new SVGEditor();
    console.log("v7");
});


