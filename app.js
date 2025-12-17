class SVGEditor {
    constructor() {
        this.currentTool = 'select';
        this.selectedElements = new Set();
        this.selectedNodes = new Set();
        this.layers = [];
        this.svgElement = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };
        this.nodeHandles = [];
        this.currentDraggedElement = null;
        this.currentDraggedNode = null;
        this.proximityThreshold = 10; // pixels - distance threshold for selecting paths
        this.proximitySelectedElement = null; // Track element selected via proximity
        
        this.init();
    }
    
    init() {
        // Setup file input
        document.getElementById('openBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.loadSVG(e.target.files[0]);
        });
        
        // Setup save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveSVG();
        });
        
        // Setup tool buttons
        document.getElementById('selectTool').addEventListener('click', () => {
            this.setTool('select');
        });
        
        document.getElementById('directSelectTool').addEventListener('click', () => {
            this.setTool('direct-select');
        });
    }
    
    setTool(tool) {
        this.currentTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => {
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
        
        // Clone and add SVG
        this.svgElement = svg.cloneNode(true);
        container.appendChild(this.svgElement);
        
        // Extract layers (paths and other drawable elements)
        this.extractLayers();
        this.renderLayersPanel();
        this.attachEventListeners();
    }
    
    extractLayers() {
        this.layers = [];
        const elements = this.svgElement.querySelectorAll('path, circle, rect, ellipse, line, polyline, polygon, g');
        
        elements.forEach((el, index) => {
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
        
        this.layers.forEach(layer => {
            const item = document.createElement('div');
            item.className = 'layer-item';
            item.dataset.layerId = layer.id;
            
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
                    this.selectElement(layer.element, e.ctrlKey || e.metaKey);
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
            const target = e.target;
            
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
                const thinElementsAtPoint = elementsAtPoint.filter(el => 
                    el !== this.svgElement && 
                    (el.tagName === 'path' || el.tagName === 'line' || 
                     el.tagName === 'polyline' || el.tagName === 'polygon')
                );
                
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
            } else if (target === this.svgElement && !e.ctrlKey && !e.metaKey) {
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
    }
    
    handleMouseDown(e, element) {
        e.preventDefault();
        e.stopPropagation();
        
        // Track if we actually moved (to distinguish click from drag)
        this.wasDragging = false;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
        
        if (this.currentTool === 'select') {
            // Select immediately on mousedown
            if (!e.ctrlKey && !e.metaKey && !this.selectedElements.has(element)) {
                this.clearSelection();
            }
            this.selectElement(element, e.ctrlKey || e.metaKey);
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
            this.selectElement(element, e.ctrlKey || e.metaKey);
            this.renderLayersPanel();
            this.showNodeHandles(element);
        }
    }
    
    handleMouseMove(e) {
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
        } else if (this.currentTool === 'direct-select' && this.isDragging && this.currentDraggedNode) {
            const rect = this.svgElement.getBoundingClientRect();
            const point = this.svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            
            // Convert screen coordinates to SVG coordinates
            const svgPoint = point.matrixTransform(this.svgElement.getScreenCTM().inverse());
            
            this.moveNode(this.currentDraggedNode.element, 
                this.currentDraggedNode.index, 
                svgPoint.x, 
                svgPoint.y);
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
            this.wasDragging = false;
            // Update layers panel after drag completes
            this.renderLayersPanel();
        }
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
        
        // Force a reflow to ensure the class is applied
        element.offsetHeight;
    }
    
    clearSelection() {
        this.selectedElements.forEach(el => {
            el.classList.remove('selected');
        });
        this.selectedElements.clear();
        this.clearNodeHandles();
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
        
        // For paths, extract all points (in element-local coordinates)
        const pathData = element.getAttribute('d');
        if (!pathData) return;
        
        const commands = this.parsePathData(pathData);
        const svgNS = 'http://www.w3.org/2000/svg';
        
        commands.forEach((cmd, index) => {
            if (cmd.type === 'M' || cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q') {
                // Convert main point from element space to SVG space
                const mainSvg = this.elementToSvgPoint(element, cmd.x, cmd.y);

                // Create handle for main point
                const handle = document.createElementNS(svgNS, 'circle');
                handle.setAttribute('class', 'node-handle');
                handle.setAttribute('cx', mainSvg.x);
                handle.setAttribute('cy', mainSvg.y);
                handle.dataset.elementId = element.id;
                handle.dataset.commandIndex = index;
                handle.dataset.pointType = 'main';
                
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    this.isDragging = true;
                    this.currentDraggedNode = {
                        element: element,
                        index: index,
                        command: cmd
                    };
                });
                
                this.svgElement.appendChild(handle);
                this.nodeHandles.push(handle);
                
                // For curves, show control points
                if (cmd.type === 'C') {
                    // Control point 1
                    const cp1Svg = this.elementToSvgPoint(element, cmd.x1, cmd.y1);
                    const cp1 = document.createElementNS(svgNS, 'circle');
                    cp1.setAttribute('class', 'node-handle');
                    cp1.setAttribute('cx', cp1Svg.x);
                    cp1.setAttribute('cy', cp1Svg.y);
                    cp1.dataset.elementId = element.id;
                    cp1.dataset.commandIndex = index;
                    cp1.dataset.pointType = 'control1';
                    cp1.style.fill = '#ff9800';
                    
                    cp1.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        this.isDragging = true;
                        this.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 1
                        };
                    });
                    
                    this.svgElement.appendChild(cp1);
                    this.nodeHandles.push(cp1);
                    
                    // Control point 2
                    const cp2Svg = this.elementToSvgPoint(element, cmd.x2, cmd.y2);
                    const cp2 = document.createElementNS(svgNS, 'circle');
                    cp2.setAttribute('class', 'node-handle');
                    cp2.setAttribute('cx', cp2Svg.x);
                    cp2.setAttribute('cy', cp2Svg.y);
                    cp2.dataset.elementId = element.id;
                    cp2.dataset.commandIndex = index;
                    cp2.dataset.pointType = 'control2';
                    cp2.style.fill = '#ff9800';
                    
                    cp2.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        this.isDragging = true;
                        this.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 2
                        };
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
            const cornerSvg = this.elementToSvgPoint(element, corner.x, corner.y);

            const handle = document.createElementNS(svgNS, 'circle');
            handle.setAttribute('class', 'node-handle');
            handle.setAttribute('cx', cornerSvg.x);
            handle.setAttribute('cy', cornerSvg.y);
            handle.dataset.elementId = element.id;
            handle.dataset.cornerIndex = index;
            
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
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
    }

    // Coordinate conversion helpers for node editing
    svgToElementPoint(element, svgX, svgY) {
        const point = this.svgElement.createSVGPoint();
        point.x = svgX;
        point.y = svgY;
        const ctm = element.getCTM();
        if (!ctm) return { x: svgX, y: svgY };
        const local = point.matrixTransform(ctm.inverse());
        return { x: local.x, y: local.y };
    }

    elementToSvgPoint(element, localX, localY) {
        const point = this.svgElement.createSVGPoint();
        point.x = localX;
        point.y = localY;
        const ctm = element.getCTM();
        if (!ctm) return { x: localX, y: localY };
        const svgPoint = point.matrixTransform(ctm);
        return { x: svgPoint.x, y: svgPoint.y };
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
    
    moveNode(element, commandIndex, x, y) {
        if (element.tagName !== 'path') return;
        
        const pathData = element.getAttribute('d');
        const commands = this.parsePathData(pathData);
        
        if (commandIndex >= commands.length) return;
        
        const cmd = commands[commandIndex];

        // Incoming x,y are in SVG coordinates – convert to element-local
        const local = this.svgToElementPoint(element, x, y);
        
        if (this.currentDraggedNode.controlPoint === 1) {
            cmd.x1 = local.x;
            cmd.y1 = local.y;
        } else if (this.currentDraggedNode.controlPoint === 2) {
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
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SVGEditor();
});

