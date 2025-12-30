class HistoryManager {
    constructor(editor) {
        this.editor = editor;
        this.history = []; // Array of history states
        this.currentIndex = -1; // Current position in history
        this.maxHistorySize = 100; // Maximum number of history states
        this.isRestoring = false; // Flag to prevent saving during undo/redo
    }
    
    /**
     * Save the current SVG state to history
     * @param {string} description - Optional description of the change
     */
    saveState(description = '') {
        if (this.isRestoring) {
            return; // Don't save during undo/redo operations
        }
        
        if (!this.editor.svgElement) {
            return;
        }
        
        // Serialize the current SVG state
        const svgClone = this.editor.svgElement.cloneNode(true);
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgClone);
        
        // Remove any states after current index (when user makes a new change after undo)
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        
        // Create history entry
        const historyEntry = {
            svgString: svgString,
            description: description || this.generateDescription(),
            timestamp: Date.now()
        };
        
        // Add to history
        this.history.push(historyEntry);
        this.currentIndex = this.history.length - 1;
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentIndex--;
        }
        
        // Update UI if available
        if (this.updateUI) {
            this.updateUI();
        }
    }
    
    /**
     * Generate a description for the change based on current selection or action
     */
    generateDescription() {
        const selectedCount = this.editor.selectedElements ? this.editor.selectedElements.size : 0;
        if (selectedCount > 0) {
            return `Modified ${selectedCount} ${selectedCount === 1 ? 'element' : 'elements'}`;
        }
        return 'Change';
    }
    
    /**
     * Undo to the previous state
     * @returns {boolean} True if undo was successful
     */
    undo() {
        if (!this.canUndo()) {
            return false;
        }
        
        this.currentIndex--;
        return this.restoreState(this.currentIndex);
    }
    
    /**
     * Redo to the next state
     * @returns {boolean} True if redo was successful
     */
    redo() {
        if (!this.canRedo()) {
            return false;
        }
        
        this.currentIndex++;
        return this.restoreState(this.currentIndex);
    }
    
    /**
     * Restore SVG to a specific history index
     * @param {number} index - The history index to restore to
     * @returns {boolean} True if restore was successful
     */
    restoreToIndex(index) {
        if (index < 0 || index >= this.history.length) {
            return false;
        }
        
        this.currentIndex = index;
        return this.restoreState(index);
    }
    
    /**
     * Restore the SVG from a history state
     * @param {number} index - The history index to restore
     * @returns {boolean} True if restore was successful
     */
    restoreState(index) {
        if (index < 0 || index >= this.history.length || !this.editor.svgElement) {
            return false;
        }
        
        this.isRestoring = true;
        
        try {
            const historyEntry = this.history[index];
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(historyEntry.svgString, 'image/svg+xml');
            const svg = svgDoc.querySelector('svg');
            
            if (!svg) {
                console.error('Failed to parse SVG from history');
                return false;
            }
            
            // Clear selection before restoring
            if (this.editor.clearSelection) {
                this.editor.clearSelection();
            }
            
            // Replace the SVG element
            const container = document.getElementById('svgContainer');
            const wrapper = this.editor.svgWrapper;
            
            if (wrapper) {
                // Clone and add SVG to wrapper
                this.editor.svgElement = svg.cloneNode(true);
                wrapper.innerHTML = '';
                wrapper.appendChild(this.editor.svgElement);
                
                // Re-extract layers and re-attach listeners
                if (this.editor.extractLayers) {
                    this.editor.extractLayers();
                }
                if (this.editor.renderLayersPanel) {
                    this.editor.renderLayersPanel();
                }
                if (this.editor.attachEventListeners) {
                    this.editor.attachEventListeners();
                }
                
                // Recreate bounding box
                if (this.editor.boundingBoxManager && this.editor.boundingBoxManager.create) {
                    const oldBBoxGroup = this.editor.svgElement.querySelector('#boundingBoxGroup');
                    if (oldBBoxGroup) {
                        oldBBoxGroup.remove();
                    }
                    this.editor.boundingBoxManager.create();
                }
            }
            
            // Update UI if available
            if (this.updateUI) {
                this.updateUI();
            }
            
            return true;
        } catch (error) {
            console.error('Error restoring history state:', error);
            return false;
        } finally {
            this.isRestoring = false;
        }
    }
    
    /**
     * Check if undo is possible
     * @returns {boolean} True if undo is possible
     */
    canUndo() {
        return this.currentIndex > 0;
    }
    
    /**
     * Check if redo is possible
     * @returns {boolean} True if redo is possible
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }
    
    /**
     * Get the current history state description
     * @returns {string} Description of current state
     */
    getCurrentDescription() {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.history[this.currentIndex].description;
        }
        return '';
    }
    
    /**
     * Get all history entries
     * @returns {Array} Array of history entries
     */
    getHistory() {
        return this.history;
    }
    
    /**
     * Get current history index
     * @returns {number} Current index
     */
    getCurrentIndex() {
        return this.currentIndex;
    }
    
    /**
     * Clear all history
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
        if (this.updateUI) {
            this.updateUI();
        }
    }
    
    /**
     * Initialize history with the current SVG state
     */
    initialize() {
        if (this.editor.svgElement) {
            this.saveState('Initial state');
        }
    }
}

