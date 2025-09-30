// public/selection/renderer.js
const { ipcRenderer } = require('electron');

const selectionBox = document.getElementById('selection-box');
const sizeBadge = document.getElementById('size-badge');
const tooltip = document.getElementById('tooltip');

let selection = { x: 0, y: 0, width: 0, height: 0 };
let action = null; // 'drawing', 'moving', 'resizing'
let startPos = { x: 0, y: 0 };
let resizeHandle = null;

// --- DOM Update Functions ---

function updateSelectionBox() {
    if (selection.width > 0 && selection.height > 0) {
        selectionBox.style.left = `${selection.x}px`;
        selectionBox.style.top = `${selection.y}px`;
        selectionBox.style.width = `${selection.width}px`;
        selectionBox.style.height = `${selection.height}px`;
        selectionBox.style.display = 'block';
    } else {
        selectionBox.style.display = 'none';
    }
}

function updateSizeBadge() {
    if (selection.width > 0 && selection.height > 0) {
        // Adjust width/height to be even for h264 compatibility preview
        const safeWidth = Math.floor(selection.width / 2) * 2;
        const safeHeight = Math.floor(selection.height / 2) * 2;
        sizeBadge.textContent = `${safeWidth} x ${safeHeight}`;
        
        // Position badge outside the bottom-right corner
        sizeBadge.style.left = `${selection.x + selection.width + 10}px`;
        sizeBadge.style.top = `${selection.y + selection.height + 10}px`;

        // Reposition if it goes off-screen
        if (selection.x + selection.width + sizeBadge.offsetWidth > window.innerWidth) {
            sizeBadge.style.left = `${selection.x - sizeBadge.offsetWidth - 10}px`;
        }
         if (selection.y + selection.height + sizeBadge.offsetHeight > window.innerHeight) {
            sizeBadge.style.top = `${selection.y - sizeBadge.offsetHeight - 10}px`;
        }

        sizeBadge.style.display = 'block';
    } else {
        sizeBadge.style.display = 'none';
    }
}

// --- Event Handlers ---

function onMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();

    startPos = { x: e.clientX, y: e.clientY };
    const target = e.target;

    if (target.classList.contains('resize-handle')) {
        action = 'resizing';
        resizeHandle = target.className.replace('resize-handle ', '');
    } else if (target === selectionBox) {
        action = 'moving';
    } else {
        action = 'drawing';
        selection = { x: startPos.x, y: startPos.y, width: 0, height: 0 };
        tooltip.style.display = 'none'; // Hide tooltip once user starts drawing
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e) {
    if (!action) return;

    const currentPos = { x: e.clientX, y: e.clientY };
    const delta = { x: currentPos.x - startPos.x, y: currentPos.y - startPos.y };

    if (action === 'drawing') {
        selection.width = Math.abs(delta.x);
        selection.height = Math.abs(delta.y);
        selection.x = delta.x > 0 ? startPos.x : currentPos.x;
        selection.y = delta.y > 0 ? startPos.y : currentPos.y;
    } 
    else if (action === 'moving') {
        selection.x += delta.x;
        selection.y += delta.y;
        startPos = currentPos; // Update startPos for smooth dragging
    } 
    else if (action === 'resizing') {
        const initialSelection = { ...selection };

        if (resizeHandle.includes('e')) {
            selection.width += delta.x;
        }
        if (resizeHandle.includes('w')) {
            selection.x += delta.x;
            selection.width -= delta.x;
        }
        if (resizeHandle.includes('s')) {
            selection.height += delta.y;
        }
        if (resizeHandle.includes('n')) {
            selection.y += delta.y;
            selection.height -= delta.y;
        }

        // Handle negative width/height (flipping the box)
        if (selection.width < 0) {
            selection.x = initialSelection.x + selection.width;
            selection.width = Math.abs(selection.width);
            resizeHandle = resizeHandle.replace('w', 'E').replace('e', 'W').toLowerCase();
        }
        if (selection.height < 0) {
            selection.y = initialSelection.y + selection.height;
            selection.height = Math.abs(selection.height);
            resizeHandle = resizeHandle.replace('n', 'S').replace('s', 'N').toLowerCase();
        }
        
        startPos = currentPos;
    }
    
    // Boundary checks to keep selection on screen
    selection.x = Math.max(0, selection.x);
    selection.y = Math.max(0, selection.y);
    if (selection.x + selection.width > window.innerWidth) {
        selection.width = window.innerWidth - selection.x;
    }
    if (selection.y + selection.height > window.innerHeight) {
        selection.height = window.innerHeight - selection.y;
    }


    updateSelectionBox();
    updateSizeBadge();
}

function onMouseUp() {
    action = null;
    resizeHandle = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
}

function onKeyDown(e) {
    if (e.key === 'Enter' && selection.width > 10 && selection.height > 10) {
        // We don't need to adjust size here, main process will do it.
        ipcRenderer.send('selection:complete', {
            x: Math.round(selection.x),
            y: Math.round(selection.y),
            width: Math.round(selection.width),
            height: Math.round(selection.height),
        });
    } else if (e.key === 'Escape') {
        ipcRenderer.send('selection:cancel');
    }
}

// --- Initialization ---
document.body.addEventListener('mousedown', onMouseDown);
window.addEventListener('keydown', onKeyDown);