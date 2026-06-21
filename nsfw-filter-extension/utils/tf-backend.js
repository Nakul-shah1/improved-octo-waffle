/**
 * TensorFlow.js backend loader with WebGPU priority, WebGL fallback.
 * This script must load before content.js.
 * 
 * Loading order: WebGPU → WebGL → CPU
 */

(async function initTF() {
  if (window.__nsfw_tf_ready) return;

  // Load core TF.js from CDN
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js');

  // Try WebGPU first (best performance on Edge Canary with GPU)
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgpu@4.20.0/dist/tf-backend-webgpu.min.js');
    await tf.setBackend('webgpu');
    await tf.ready();
    console.log('[NSFW Filter] ✓ WebGPU backend active');
  } catch (e) {
    console.warn('[NSFW Filter] WebGPU unavailable, trying WebGL...');
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('[NSFW Filter] ✓ WebGL backend active');
    } catch (e2) {
      console.warn('[NSFW Filter] WebGL unavailable, using CPU...');
      await tf.setBackend('cpu');
      await tf.ready();
      console.log('[NSFW Filter] ✓ CPU backend active');
    }
  }

  window.__nsfw_tf_ready = true;
})();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    (document.head || document.documentElement).appendChild(script);
  });
}
