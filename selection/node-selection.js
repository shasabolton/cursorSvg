/**
 * NodeSelectionManager
 * Manages node selection state and node handle creation/management
 */
class NodeSelectionManager {
    constructor(editor) {
        this.editor = editor;
        this.selectedNodes = new Set();
        this.nodeHandles = [];
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

    clearNodeHandles() {
        this.nodeHandles.forEach(handle => {
            if (handle.parentNode) {
                handle.parentNode.removeChild(handle);
            }
        });
        this.nodeHandles = [];
        // Note: We preserve selectedNodes Set so selection can be restored when handles are recreated
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

        const commands = this.editor.parsePathData(pathData);
        const svgNS = 'http://www.w3.org/2000/svg';

        commands.forEach((cmd, index) => {
            if (cmd.type === 'M' || cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q') {
                // Transform point from element-local (path data) to rendered SVG space
                const mainSvg = this.editor.toRootCoords(element, cmd.x, cmd.y);

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
                    // Store pending selection to be applied on mouseup (if not a drag)
                    this.editor.pendingSelectionNode = handle;
                    this.editor.pendingSelectionNodeMultiSelect = isMultiSelect;
                    this.editor.wasDragging = false;
                    this.editor.dragStartPos = { x: e.clientX, y: e.clientY };

                    // Prepare for dragging
                    this.editor.isDragging = true;
                    this.editor.currentDraggedNode = {
                        element: element,
                        index: index,
                        command: cmd
                    };

                    // Store initial positions of all selected nodes
                    this.editor.selectedNodesInitialPositions.clear();
                    this.selectedNodes.forEach(nodeId => {
                        const nodeInfo = this.editor.parseNodeId(nodeId);
                        if (nodeInfo) {
                            const pos = this.editor.getNodePosition(nodeInfo);
                            if (pos) {
                                this.editor.selectedNodesInitialPositions.set(nodeId, { nodeInfo, pos });
                            }
                        }
                    });
                });

                this.editor.svgElement.appendChild(handle);
                this.nodeHandles.push(handle);

                // For curves, show control points (transform to rendered space as well)
                if (cmd.type === 'C') {
                    const cp1Svg = this.editor.toRootCoords(element, cmd.x1, cmd.y1);
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
                        // Store pending selection to be applied on mouseup (if not a drag)
                        this.editor.pendingSelectionNode = cp1;
                        this.editor.pendingSelectionNodeMultiSelect = isMultiSelect;
                        this.editor.wasDragging = false;
                        this.editor.dragStartPos = { x: e.clientX, y: e.clientY };

                        // Prepare for dragging
                        this.editor.isDragging = true;
                        this.editor.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 1
                        };

                        // Store initial positions of all selected nodes
                        this.editor.selectedNodesInitialPositions.clear();
                        this.selectedNodes.forEach(nodeId => {
                            const nodeInfo = this.editor.parseNodeId(nodeId);
                            if (nodeInfo) {
                                const pos = this.editor.getNodePosition(nodeInfo);
                                if (pos) {
                                    this.editor.selectedNodesInitialPositions.set(nodeId, { nodeInfo, pos });
                                }
                            }
                        });
                    });

                    this.editor.svgElement.appendChild(cp1);
                    this.nodeHandles.push(cp1);

                    const cp2Svg = this.editor.toRootCoords(element, cmd.x2, cmd.y2);
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
                        // Store pending selection to be applied on mouseup (if not a drag)
                        this.editor.pendingSelectionNode = cp2;
                        this.editor.pendingSelectionNodeMultiSelect = isMultiSelect;
                        this.editor.wasDragging = false;
                        this.editor.dragStartPos = { x: e.clientX, y: e.clientY };

                        // Prepare for dragging
                        this.editor.isDragging = true;
                        this.editor.currentDraggedNode = {
                            element: element,
                            index: index,
                            command: cmd,
                            controlPoint: 2
                        };

                        // Store initial positions of all selected nodes
                        this.editor.selectedNodesInitialPositions.clear();
                        this.selectedNodes.forEach(nodeId => {
                            const nodeInfo = this.editor.parseNodeId(nodeId);
                            if (nodeInfo) {
                                const pos = this.editor.getNodePosition(nodeInfo);
                                if (pos) {
                                    this.editor.selectedNodesInitialPositions.set(nodeId, { nodeInfo, pos });
                                }
                            }
                        });
                    });

                    this.editor.svgElement.appendChild(cp2);
                    this.nodeHandles.push(cp2);
                }
            }
        });

        // Apply inverse scale transform to maintain constant screen size
        this.updateNodeHandleTransforms();
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
            const cornerSvg = this.editor.toRootCoords(element, corner.x, corner.y);

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
                // Store pending selection to be applied on mouseup (if not a drag)
                this.editor.pendingSelectionNode = handle;
                this.editor.pendingSelectionNodeMultiSelect = isMultiSelect;
                this.editor.wasDragging = false;
                this.editor.dragStartPos = { x: e.clientX, y: e.clientY };

                // For non-path elements, we'll move the entire element
                this.editor.isDragging = true;
                this.editor.currentDraggedElement = element;
                const point = this.editor.svgElement.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());
                this.editor.dragStart = {
                    x: svgPoint.x,
                    y: svgPoint.y
                };
                const transform = this.editor.getElementTransform(element);
                this.editor.dragOffset = {
                    x: transform.x,
                    y: transform.y
                };
            });

            this.editor.svgElement.appendChild(handle);
            this.nodeHandles.push(handle);
        });

        // Apply inverse scale transform to maintain constant screen size
        this.updateNodeHandleTransforms();
    }

    selectNodesInMarquee(marqueeX, marqueeY, marqueeWidth, marqueeHeight) {
        // Only select nodes from currently selected path elements
        if (this.editor.selectedElements.size === 0) {
            return; // No paths selected, can't select nodes
        }

        // Clear node selection only if not using modifier keys
        if (!this.editor.marqueeMultiSelect) {
            this.clearNodeSelection();
        }

        // Collect nodes that are within the marquee rectangle
        const nodesToSelect = [];

        this.editor.selectedElements.forEach(element => {
            // Only process path elements
            if (element.tagName !== 'path') {
                return;
            }

            // Get all node handles for this path
            const pathData = element.getAttribute('d');
            if (!pathData) return;

            const commands = this.editor.parsePathData(pathData);
            const elementId = element.id || '';

            commands.forEach((cmd, index) => {
                // Check main point
                if (cmd.type === 'M' || cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Q') {
                    const nodePos = this.editor.getNodePosition({ element, index, pointType: 'main' });
                    if (nodePos) {
                        // Check if node position is within marquee rectangle
                        if (nodePos.x >= marqueeX && nodePos.x <= marqueeX + marqueeWidth &&
                            nodePos.y >= marqueeY && nodePos.y <= marqueeY + marqueeHeight) {
                            const nodeId = `${elementId}-${index}-main`;
                            nodesToSelect.push(nodeId);
                        }
                    }
                }

                // Check control points for curves
                if (cmd.type === 'C' || cmd.type === 'Q') {
                    // Control point 1
                    if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
                        const nodePos = this.editor.getNodePosition({ element, index, pointType: 'control1' });
                        if (nodePos) {
                            if (nodePos.x >= marqueeX && nodePos.x <= marqueeX + marqueeWidth &&
                                nodePos.y >= marqueeY && nodePos.y <= marqueeY + marqueeHeight) {
                                const nodeId = `${elementId}-${index}-control1`;
                                nodesToSelect.push(nodeId);
                            }
                        }
                    }

                    // Control point 2 (for C commands)
                    if (cmd.type === 'C' && cmd.x2 !== undefined && cmd.y2 !== undefined) {
                        const nodePos = this.editor.getNodePosition({ element, index, pointType: 'control2' });
                        if (nodePos) {
                            if (nodePos.x >= marqueeX && nodePos.x <= marqueeX + marqueeWidth &&
                                nodePos.y >= marqueeY && nodePos.y <= marqueeY + marqueeHeight) {
                                const nodeId = `${elementId}-${index}-control2`;
                                nodesToSelect.push(nodeId);
                            }
                        }
                    }
                }
            });
        });

        // Select all collected nodes
        nodesToSelect.forEach(nodeId => {
            if (this.editor.marqueeMultiSelect) {
                // Toggle selection
                if (this.selectedNodes.has(nodeId)) {
                    this.selectedNodes.delete(nodeId);
                } else {
                    this.selectedNodes.add(nodeId);
                }
            } else {
                // Add to selection
                this.selectedNodes.add(nodeId);
            }
        });

        // Update node handles to reflect selection
        this.updateNodeHandleSelection();
    }

    updateNodeHandleSelection() {
        // Update visual selection state of node handles
        this.nodeHandles.forEach(handle => {
            const commandIndex = handle.dataset.commandIndex;
            const cornerIndex = handle.dataset.cornerIndex;
            const pointType = handle.dataset.pointType || (cornerIndex !== undefined ? `corner${cornerIndex}` : 'main');
            const index = commandIndex !== undefined ? commandIndex : cornerIndex;
            const elementId = handle.dataset.elementId || '';
            const nodeId = `${elementId}-${index}-${pointType}`;

            if (this.selectedNodes.has(nodeId)) {
                handle.classList.add('selected');
            } else {
                handle.classList.remove('selected');
            }
        });
    }

    updateNodeHandleTransforms() {
        // Apply inverse scale to node handles so they maintain constant screen size
        const inverseScale = 1 / this.editor.zoomLevel;
        this.nodeHandles.forEach(handle => {
            if (handle) {
                // Get the current position in SVG coordinates
                const cx = parseFloat(handle.getAttribute('cx')) || 0;
                const cy = parseFloat(handle.getAttribute('cy')) || 0;

                // Apply inverse scale transform centered at the handle position
                // This keeps the handle at a constant screen size regardless of zoom
                handle.setAttribute('transform', `translate(${cx}, ${cy}) scale(${inverseScale}) translate(${-cx}, ${-cy})`);
            }
        });
    }
}

