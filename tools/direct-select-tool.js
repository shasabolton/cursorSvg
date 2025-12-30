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
            // Fallback: just move the current node if we don't have initial position
            this.editor.moveNode(this.editor.currentDraggedNode.element,
                this.editor.currentDraggedNode.index,
                svgPoint.x,
                svgPoint.y);
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
}

