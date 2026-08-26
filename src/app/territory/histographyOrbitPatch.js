'use client';

import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

const PATCH_FLAG = Symbol.for('rulers-of-russia.histography-orbit-v1');
const states = new WeakMap();
const proto = OrbitControls.prototype;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function dispatchChange(controls) {
  controls.dispatchEvent({type: 'change'});
}

function syncSpherical(controls, state) {
  state.offset.copy(controls.object.position).sub(controls.target);
  state.spherical.setFromVector3(state.offset);
  state.spherical.makeSafe();
}

function applySpherical(controls, state) {
  state.spherical.phi = clamp(state.spherical.phi, 0.07, Math.PI - 0.07);
  state.spherical.radius = clamp(state.spherical.radius, controls.minDistance, controls.maxDistance);
  state.offset.setFromSpherical(state.spherical);
  controls.object.position.copy(controls.target).add(state.offset);
  controls.object.lookAt(controls.target);
  controls.object.updateMatrixWorld();
}

function globeHit(controls, state, clientX, clientY) {
  const rect = state.dom.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  state.ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  state.raycaster.setFromCamera(state.ndc, controls.object);
  const hit = new THREE.Vector3();
  return state.raycaster.ray.intersectSphere(state.sphere, hit) ? hit : null;
}

function stopInertia(state) {
  if (state.raf !== null) cancelAnimationFrame(state.raf);
  state.raf = null;
}

function startInertia(controls, state) {
  stopInertia(state);
  let previous = performance.now();
  const frame = (now) => {
    const dt = Math.min(34, Math.max(8, now - previous));
    previous = now;
    const frameScale = dt / 16.6667;
    const close = clamp((state.spherical.radius - controls.minDistance) / 0.8, 0, 1);
    const decay = Math.pow(0.84 + close * 0.075, frameScale);

    state.spherical.theta += state.velocityTheta * frameScale;
    state.spherical.phi += state.velocityPhi * frameScale;
    state.velocityTheta *= decay;
    state.velocityPhi *= decay;
    applySpherical(controls, state);
    dispatchChange(controls);

    if (Math.abs(state.velocityTheta) + Math.abs(state.velocityPhi) < 0.000025) {
      state.raf = null;
      return;
    }
    state.raf = requestAnimationFrame(frame);
  };
  state.raf = requestAnimationFrame(frame);
}

function connectPatched() {
  const dom = this.domElement;
  if (!dom || states.has(this)) return;

  const state = {
    dom,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    velocityTheta: 0,
    velocityPhi: 0,
    raf: null,
    previousTouchAction: dom.style.touchAction,
    spherical: new THREE.Spherical(),
    offset: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
    ndc: new THREE.Vector2(),
    sphere: new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0004),
  };

  state.onPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    stopInertia(state);
    state.pointerId = event.pointerId;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastT = performance.now();
    state.velocityTheta = 0;
    state.velocityPhi = 0;
    syncSpherical(this, state);
    dom.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  state.onPointerMove = (event) => {
    if (state.pointerId !== event.pointerId) return;
    const now = performance.now();
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    const dt = Math.max(8, now - state.lastT);
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.lastT = now;

    const radius = state.spherical.radius;
    const zoomFactor = clamp((radius - this.minDistance) / 1.15, 0, 1);
    const speedFactor = clamp(this.rotateSpeed / 0.68, 0.13, 1.15);
    const radiansPerPixel = (0.00042 + 0.0025 * zoomFactor) * speedFactor;
    const dTheta = -dx * radiansPerPixel;
    const dPhi = -dy * radiansPerPixel;

    state.spherical.theta += dTheta;
    state.spherical.phi += dPhi;
    state.velocityTheta = dTheta * (16.6667 / dt);
    state.velocityPhi = dPhi * (16.6667 / dt);
    applySpherical(this, state);
    dispatchChange(this);
    event.preventDefault();
  };

  state.onPointerUp = (event) => {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;
    try { dom.releasePointerCapture?.(event.pointerId); } catch {}
    if (Math.abs(state.velocityTheta) + Math.abs(state.velocityPhi) > 0.00004) startInertia(this, state);
    event.preventDefault();
  };

  state.onWheel = (event) => {
    stopInertia(state);
    syncSpherical(this, state);
    const beforeHit = globeHit(this, state, event.clientX, event.clientY);
    const oldRadius = state.spherical.radius;
    const close = clamp((oldRadius - this.minDistance) / 1.1, 0, 1);
    const adaptiveZoom = (0.24 + 0.76 * close) * clamp(this.zoomSpeed / 0.72, 0.2, 1.2);
    const nextRadius = clamp(
      oldRadius * Math.exp(event.deltaY * 0.00105 * adaptiveZoom),
      this.minDistance,
      this.maxDistance,
    );
    if (Math.abs(nextRadius - oldRadius) < 0.00001) {
      event.preventDefault();
      return;
    }

    state.spherical.radius = nextRadius;
    applySpherical(this, state);

    if (beforeHit) {
      const afterHit = globeHit(this, state, event.clientX, event.clientY);
      if (afterHit) {
        const from = afterHit.clone().normalize();
        const to = beforeHit.clone().normalize();
        const correction = new THREE.Quaternion().setFromUnitVectors(from, to);
        state.offset.copy(this.object.position).sub(this.target).applyQuaternion(correction);
        this.object.position.copy(this.target).add(state.offset);
        this.object.lookAt(this.target);
        this.object.updateMatrixWorld();
        syncSpherical(this, state);
        applySpherical(this, state);
      }
    }

    dispatchChange(this);
    event.preventDefault();
  };

  dom.style.touchAction = 'none';
  dom.addEventListener('pointerdown', state.onPointerDown, {passive: false});
  dom.addEventListener('pointermove', state.onPointerMove, {passive: false});
  dom.addEventListener('pointerup', state.onPointerUp, {passive: false});
  dom.addEventListener('pointercancel', state.onPointerUp, {passive: false});
  dom.addEventListener('wheel', state.onWheel, {passive: false});
  states.set(this, state);
  syncSpherical(this, state);
  applySpherical(this, state);
}

function disconnectPatched() {
  const state = states.get(this);
  if (!state) return;
  stopInertia(state);
  state.dom.removeEventListener('pointerdown', state.onPointerDown);
  state.dom.removeEventListener('pointermove', state.onPointerMove);
  state.dom.removeEventListener('pointerup', state.onPointerUp);
  state.dom.removeEventListener('pointercancel', state.onPointerUp);
  state.dom.removeEventListener('wheel', state.onWheel);
  state.dom.style.touchAction = state.previousTouchAction;
  states.delete(this);
}

function updatePatched() {
  const state = states.get(this);
  if (!state) return false;
  stopInertia(state);
  syncSpherical(this, state);
  applySpherical(this, state);
  dispatchChange(this);
  return true;
}

if (!proto[PATCH_FLAG]) {
  proto.connect = connectPatched;
  proto.disconnect = disconnectPatched;
  proto.dispose = disconnectPatched;
  proto.update = updatePatched;
  proto[PATCH_FLAG] = true;
}
