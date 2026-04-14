import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createLogger } from '../debug/logger.js';
import { DebugConsole } from '../debug/DebugConsole.jsx';
import { timeStep } from '../pipeline/timeStep.js';
import { parsePcfText } from '../pcf/parsePcfText.js';
import { normalizePcfModel } from '../pcf/normalizePcfModel.js';
import { buildExportScene } from '../glb/buildExportScene.js';

export function PcfGlbExporterPanel() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('Idle');
  const [currentBlob, setCurrentBlob] = useState(null);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const reqIdRef = useRef(null);

  const logger = useMemo(() => createLogger(1000), []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const width = canvasRef.current.clientWidth || 600;
    const height = canvasRef.current.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 1000, 100);
    scene.add(dirLight);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 100000);
    camera.position.set(5000, 5000, 5000);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(width, height);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setCurrentBlob(null);
      setStatus('File Selected');
      logger.info('FILE_SELECTED', { name: e.target.files[0].name, size: e.target.files[0].size });

      // Auto-run pipeline when file is selected
      runPipeline(e.target.files[0]);
    }
  };

  const runPipeline = async (activeFile = file) => {
    if (!activeFile) {
      logger.warn('NO_FILE_SELECTED');
      return;
    }

    // Phase 7: Large file fallback
    const fileSizeMB = activeFile.size / (1024 * 1024);
    if (fileSizeMB > 5) {
      logger.warn('LARGE_FILE_DETECTED', { sizeMB: fileSizeMB.toFixed(2) });
      const proceed = window.confirm(`File size is ${fileSizeMB.toFixed(2)} MB. Parsing large files on the main thread may freeze your browser. Do you want to proceed anyway?`);
      if (!proceed) {
        setStatus('Cancelled');
        logger.info('PIPELINE_CANCELLED_USER');
        return;
      }
      logger.info('LARGE_FILE_MAIN_THREAD_PARSE');
    }
    if (fileSizeMB > 20) {
      logger.warn('CRITICAL_FILE_SIZE', { sizeMB: fileSizeMB.toFixed(2) });
      const sure = window.confirm('WARNING: Files over 20 MB will likely crash the browser tab without a worker mode. Proceed?');
      if (!sure) {
        setStatus('Cancelled');
        logger.info('PIPELINE_CANCELLED_USER');
        return;
      }
    }

    try {
      setStatus('Reading file...');
      logger.info('PIPELINE_STARTED', { file: activeFile.name });
      const text = await timeStep(logger, 'FILE_READ', () => activeFile.text());

      setStatus('Parsing PCF...');
      const parsed = await timeStep(logger, 'PARSE', () => parsePcfText(text, logger, activeFile));

      setStatus('Normalizing model...');
      const model = await timeStep(logger, 'NORMALIZE', () => normalizePcfModel(parsed, logger));

      setStatus('Building geometry...');
      const scene = await timeStep(logger, 'BUILD_GEOMETRY', () => buildExportScene(model, logger));

      setStatus('Exporting GLB...');
      const blob = await timeStep(logger, 'EXPORT_GLB', async () => {
        const exporter = new GLTFExporter();
        const result = await exporter.parseAsync(scene, {
          binary: true,
          onlyVisible: true,
          trs: false,
        });
        return new Blob([result], { type: 'model/gltf-binary' });
      });

      setCurrentBlob(blob);
      logger.info('GLB_CREATED', { bytes: blob.size });
      setStatus('Preview ready');

      // Auto-preview
      handlePreview(blob);

    } catch (e) {
      setStatus('Failed');
      logger.error('PIPELINE_FAILED', { message: e.message });
    }
  };

  const handleDownload = async () => {
    if (!currentBlob || !file) return;

    const url = URL.createObjectURL(currentBlob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pcf', '').replace('.txt', '')}_export.glb`;
      a.click();
      logger.info('DOWNLOAD_TRIGGERED', { fileName: a.download });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handlePreview = async (blob = currentBlob) => {
    if (!blob || !sceneRef.current) return;

    try {
      setStatus('Loading preview...');
      await timeStep(logger, 'PREVIEW', async () => {
        const loader = new GLTFLoader();
        const url = URL.createObjectURL(blob);

        await new Promise((resolve, reject) => {
          loader.load(url, (gltf) => {
            // Clear existing models, keep lights
            const toRemove = [];
            sceneRef.current.children.forEach(c => {
              if (!c.isLight) toRemove.push(c);
            });
            toRemove.forEach(c => sceneRef.current.remove(c));

            sceneRef.current.add(gltf.scene);

            // Auto camera center
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            if (controlsRef.current && cameraRef.current) {
              controlsRef.current.target.copy(center);
              cameraRef.current.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
              cameraRef.current.lookAt(center);
              controlsRef.current.update();
            }

            URL.revokeObjectURL(url);
            logger.info('PREVIEW_LOADED', { nodes: gltf.scene.children.length });
            resolve();
          }, undefined, (err) => {
            URL.revokeObjectURL(url);
            logger.error('PREVIEW_LOAD_ERROR', { error: err.message });
            reject(err);
          });
        });
      });
      setStatus('Preview ready');
    } catch (e) {
      setStatus('Preview failed');
      logger.error('PREVIEW_GLB_FAILED', { message: e.message });
    }
  };

  const handleClear = () => {
    setFile(null);
    setCurrentBlob(null);
    setStatus('Idle');
    if (sceneRef.current) {
      const toRemove = [];
      sceneRef.current.children.forEach(c => {
        if (!c.isLight) toRemove.push(c);
      });
      toRemove.forEach(c => sceneRef.current.remove(c));
    }
    const fileInput = document.querySelector("input[type='file']");
    if (fileInput) fileInput.value = '';
    logger.clear();
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>PCF to GLB Export Pipeline</h2>
        <span style={{ padding: '4px 8px', background: '#eee', borderRadius: '4px', fontWeight: 'bold' }}>Status: {status}</span>
      </div>

      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: '#f5f5f5', padding: '10px', borderRadius: '4px', flexWrap: 'wrap' }}>
        <input type="file" accept=".pcf,.txt" onChange={handleFileChange} />
        <button onClick={() => runPipeline()} disabled={!file} style={{ padding: '6px 12px' }}>Run Pipeline (All Proxies)</button>
        <button onClick={() => handlePreview()} disabled={!currentBlob} style={{ padding: '6px 12px' }}>Preview 3D</button>
        <button onClick={handleDownload} disabled={!currentBlob} style={{ padding: '6px 12px', background: '#4ec9b0', color: 'black', border: 'none', borderRadius: '3px' }}>Download GLB</button>
        <button onClick={handleClear} style={{ padding: '6px 12px', marginLeft: 'auto' }}>Clear</button>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: '0', flexDirection: 'row' }}>
        <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DebugConsole logger={logger} />
        </div>
      </div>
    </div>
  );
}
