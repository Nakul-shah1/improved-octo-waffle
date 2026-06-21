/**
 * TensorFlow.js backend loader with WebGPU priority, WebGL fallback.
 * This script must load before content.js.
 */

// Configure TF.js to use WebGPU first, then WebGL, then CPU
async function initTF() {
  // Dynamically import TF.js from CDN (bundled approach for MV3)
  if (window.__nsfw_tf_ready) return;

  // We'll load tfjs and the webgpu backend via importScripts or dynamic import
  // For content scripts in MV3, we use dynamic script injection
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgpu@4.20.0/dist/tf-backend-webgpu.min.js');
    await tf.setBackend('webgpu');
    console.log('[NSFW Filter] Using WebGPU backend');
  } catch (e) {
    console.warn('[NSFW Filter] WebGPU not available, falling back to WebGL:', e);
    try {
      await tf.setBackend('webgl');
      console.log('[NSFW Filter] Using WebGL backend');
    } catch (e2) {
      console.warn('[NSFW Filter] WebGL not available, falling back to CPU:', e2);
      await tf.setBackend('cpu');
    }
  }

  await tf.ready();
  window.__nsfw_tf_ready = true;
  console.log('[NSFW Filter] TF.js ready with backend:', tf.getBackend());
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Auto-init
initTF();
