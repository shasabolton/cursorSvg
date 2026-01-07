/**
 * DirectSelectTool
 * Handles mouse interactions for the direct-select tool (node editing)
 */
class DirectSelectTool {
    constructor(editor) {
        this.editor = editor;
    }

    onMouseDown(e, element) {
        // Direct select doesn't drag elements, only nodes
        // Node dragging is handled in node-selection.js
        return false; // Don't handle element dragging
    }

    onMouseMove(e) {
        if (!this.editor.isDragging || !this.editor.currentDraggedNode) {
            return false;
        }

        // Check if we've moved enough to consider it a drag
        const moveThreshold = 3;
        const movedX = Math.abs(e.clientX - this.editor.dragStartPos.x);
        const movedY = Math.abs(e.clientY - this.editor.dragStartPos.y);

        if (movedX > moveThreshold || movedY > moveThreshold) {
            this.editor.wasDragging = true;
        }

        const rect = this.editor.svgElement.getBoundingClientRect();
        const point = this.editor.svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;

        // Convert screen coordinates to SVG coordinates
        const svgPoint = point.matrixTransform(this.editor.svgElement.getScreenCTM().inverse());

        // Get the nodeId for the current dragged node
        const elementId = this.editor.currentDraggedNode.element.id || '';
        const index = this.editor.currentDraggedNode.index;
        const pointType = this.editor.currentDraggedNode.controlPoint === 1 ? 'control1' :
                         this.editor.currentDraggedNode.controlPoint === 2 ? 'control2' : 'main';
        const currentNodeId = `${elementId}-${index}-${pointType}`;

        // Get initial position of the current dragged node
        const currentInitialData = this.editor.selectedNodesInitialPositions.get(currentNodeId);
        if (!currentInitialData) {
            // Fallback: get current position to calculate delta
            const currentPos = this.editor.getNodePosition({
                element: this.editor.currentDraggedNode.element,
                index: this.editor.currentDraggedNode.index,
                pointType: pointType
            });
            
            if (currentPos) {
                const deltaX = svgPoint.x - currentPos.x;
                const deltaY = svgPoint.y - currentPos.y;
                
                // Move the current node
                this.editor.moveNode(this.editor.currentDraggedNode.element,
                    this.editor.currentDraggedNode.index,
                    svgPoint.x,
                    svgPoint.y);
                
                // Also move adjacent bezier handles if dragging a main node
                if (!this.editor.currentDraggedNode.controlPoint && 
                    this.editor.currentDraggedNode.element.tagName === 'path') {
                    this.moveAdjacentBezierHandles(
                        this.editor.currentDraggedNode.element,
                        this.editor.currentDraggedNode.index,
                        deltaX,
                        deltaY
                    );
                }
            } else {
                // Last resort: just move the node
                this.editor.moveNode(this.editor.currentDraggedNode.element,
                    this.editor.currentDraggedNode.index,
                    svgPoint.x,
                    svgPoint.y);
            }
        } else {
            // Calculate delta from initial position
            const deltaX = svgPoint.x - currentInitialData.pos.x;
            const deltaY = svgPoint.y - currentInitialData.pos.y;

            // Move all selected nodes by the same delta
            this.editor.selectedNodes.forEach(nodeId => {
                const nodeData = this.editor.selectedNodesInitialPositions.get(nodeId);
                if (!nodeData || !nodeData.nodeInfo) return;

                const { nodeInfo, pos } = nodeData;

                // Calculate new position
                const newX = pos.x + deltaX;
                const newY = pos.y + deltaY;

                // Move this node
                if (nodeInfo.element.tagName === 'path') {
                    this.editor.moveNode(nodeInfo.element, nodeInfo.index, newX, newY, nodeInfo.pointType);
                    
                    // If this is a main node, also move adjacent bezier handles
                    if (nodeInfo.pointType === 'main' || !nodeInfo.pointType) {
                        this.moveAdjacentBezierHandles(nodeInfo.element, nodeInfo.index, deltaX, deltaY);
                    }
                } else {
                    // For non-path elements, we need to handle corner movement differently
                    // This would require moving the entire element, which is more complex
                    // For now, skip non-path elements in multi-node drag
                }
            });
        }

        // Update transform panel during node dragging (shape may change)
        this.editor.updateTransformPanel();
        return true; // Handled
    }

    onMouseUp(e) {
        // Cleanup is handled in main handleMouseUp
        return false;
    }

    onElementSelected(element) {
        // Show node handles when an element is selected in direct-select mode
        this.editor.showNodeHandles(element);
    }

    /**
     * Move bezier handles directly before and after a main node by the same delta
     * @param {SVGElement} element - The path element
     * @param {number} commandIndex - The index of the command containing the main node
     * @param {number} deltaX - Delta X in root SVG coordinates
     * @param {number} deltaY - Delta Y in root SVG coordinates
     */
    moveAdjacentBezierHandles(element, commandIndex, deltaX, deltaY) {
        var originalMaintainTangency = this.editor.maintainTangency;
        this.editor.maintainTangency = false;
        if (element.tagName !== 'path') return;
        
        const pathData = element.getAttribute('d');
        if (!pathData) return;
        
        const commands = this.editor.parsePathData(pathData);
        if (commandIndex >= commands.length) return;
        
        const elementId = element.id || '';
        const cmd = commands[commandIndex];
        
        // If the current command is a C command, move its control2 (handle before the endpoint)
        if (cmd.type === 'C') {
            const control2NodeId = `${elementId}-${commandIndex}-control2`;
            
            // Only move if not already selected (to avoid double-moving)
            if (!this.editor.selectedNodes.has(control2NodeId)) {
                // Get current position of control2 in root coordinates
                const control2Pos = this.editor.getNodePosition({ 
                    element, 
                    index: commandIndex, 
                    pointType: 'control2' 
                });
                if (control2Pos) {
                    // Move control2 by the same delta
                    const newControl2X = control2Pos.x + deltaX;
                    const newControl2Y = control2Pos.y + deltaY;
                    this.editor.moveNode(element, commandIndex, newControl2X, newControl2Y, 'control2');
                }
            }
        }
        
        // Check next command (if it exists and is a C command)
        // The next command's control1 is the handle "after" the current command ends
        if (commandIndex < commands.length - 1) {
            const nextCmd = commands[commandIndex + 1];
            if (nextCmd.type === 'C') {
                // Next command is a curve - its control1 is the handle after current command ends
                // In SVG paths, consecutive commands share endpoints, so next command starts at cmd.x, cmd.y
                const nextControl1NodeId = `${elementId}-${commandIndex + 1}-control1`;
                
                // Only move if not already selected (to avoid double-moving)
                if (!this.editor.selectedNodes.has(nextControl1NodeId)) {
                    // Get current position of control1 in root coordinates
                    const control1Pos = this.editor.getNodePosition({ 
                        element, 
                        index: commandIndex + 1, 
                        pointType: 'control1' 
                    });
                    if (control1Pos) {
                        // Move control1 by the same delta
                        const newControl1X = control1Pos.x + deltaX;
                        const newControl1Y = control1Pos.y + deltaY;
                        this.editor.moveNode(element, commandIndex + 1, newControl1X, newControl1Y, 'control1');
                    }
                }
            }
        }
        this.editor.maintainTangency = originalMaintainTangency;
    }
}


