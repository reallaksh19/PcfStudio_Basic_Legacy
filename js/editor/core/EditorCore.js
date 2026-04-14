/**
 * js/editor/editor-core.js
 * Core logic for interaction: Selection, Highlighting, and linking UI to Scene.
 */

import * as THREE from 'three';
import { UIManager } from '../ui/UIManager.js';
import { ValidatorUI } from '../ui/ValidatorUI.js';
import { EditorState } from '../state/EditorState.js';

export class EditorCore {
    constructor(viewer) {
        this.viewer = viewer;
        this.selectedMesh = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Highlight Material
        this.highlightMat = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0x444400,
            transparent: true,
            opacity: 0.8
        });
        this.originalMat = null;

        // State Manager
        this.state = new EditorState();

        // UI Manager
        this.ui = new UIManager(this.viewer.container, this);
        this.validatorUI = new ValidatorUI(this.viewer.container, this);

        this._wireInteraction();
    }

    _wireInteraction() {
        const dom = this.viewer.renderer.domElement;

        dom.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        // Handle window resize for UI scaling if needed (handled by CSS generally)
    }

    _onPointerDown(event) {
        if (event.button !== 0) return; // Only Left Click

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.viewer.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viewer.camera);

        // Raycast against component group
        if (!this.viewer._componentGroup) return;

        const intersects = this.raycaster.intersectObjects(this.viewer._componentGroup.children, true);

        if (intersects.length > 0) {
            // Find the first object that is a "Component Mesh" (has userData with component ref)
            // Note: Meshes are often children of Groups in Complex components.
            // But viewer-3d.js creates simple Meshes added directly to _componentGroup?
            // Wait, viewer-3d adds meshes to _componentGroup.

            const hit = intersects[0].object;
            this.select(hit);
        } else {
            this.deselectAll();
        }
    }

    select(mesh) {
        // If same mesh, do nothing
        if (this.selectedMesh === mesh) return;

        // Restore previous material
        this.deselectAll();

        this.selectedMesh = mesh;
        this.originalMat = mesh.material; // Save original
        mesh.material = this.highlightMat; // Apply highlight

        // Show UI
        if (mesh.userData && Object.keys(mesh.userData).length > 0) {
            this.ui.showPanel(mesh.userData);
        } else {
            // Fallback for meshes without data (e.g. debug helpers)
            this.ui.showPanel({ info: "No Component Data" });
        }
    }

    deselectAll() {
        if (this.selectedMesh && this.originalMat) {
            this.selectedMesh.material = this.originalMat;
            this.selectedMesh = null;
            this.originalMat = null;
        }
        this.ui.hidePanel();
    }

    updateComponentProperty(key, value) {
        if (!this.selectedMesh) return;

        // Update local data
        this.selectedMesh.userData[key] = value;

        console.log(`[Editor] Updated ${key} to ${value} for mesh ${this.selectedMesh.uuid}`);

        // Update Global State (Two-Way Binding)
        const refNo = this.selectedMesh.userData.refNo || this.selectedMesh.userData.refno;
        if (refNo) {
            this.state.updateComponent(refNo, key, value);
        }
    }
}
