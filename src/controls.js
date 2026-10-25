import * as THREE from 'three';

/**
 * Cinematic 6-DOF Space Flight & Free Mouse-Look Controller
 * - 360° Free Mouse Drag: rotate view in arbitrary directions with inertia and damping
 * - WASD Flight: smooth relativistic spacecraft propulsion with inertia
 * - Space / C: vertical climb and descent
 * - Shift: turbo boost
 * - Mouse Wheel: forward/backward thruster impulse
 * - Adaptive Speed Scaling: microscopic precision near the event horizon, high-speed flight in deep space
 * - Gravitational Safety Boundary: skims photon sphere without coordinate collapse
 * - Smooth Reset: cinematic camera interpolation back to iconic reference framing
 */
export class SpaceFlightControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // View angles (Euler order 'YXZ' prevents gimbal lock within pitch limits)
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    // Smooth spaceship physics & inertia
    this.velocity = new THREE.Vector3();
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      boost: false
    };

    // Reusable pooled vectors to eliminate per-frame GC allocations and stutter
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._moveDir = new THREE.Vector3();
    this._radial = new THREE.Vector3();
    this._pinchForward = new THREE.Vector3();
    this._wheelForward = new THREE.Vector3();

    // Pointer drag & touch configuration
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.activePointers = new Map();
    this.prevPinchDist = null;
    this.rotateSpeed = 0.0026;
    this.rotDampingCoeff = 7.8; // Frame-rate independent: 1 - exp(-k * dt) ≈ 0.12 at 60fps

    // Boundary constraints (Schwarzschild radius = 1.0, horizon = 1.002)
    // Allows flying directly to the event horizon razor edge (r = 1.015 Rs) where shadow engulfs ~97.5% of the sky!
    this.minRadius = 1.015;
    this.maxRadius = 55.0; // Deep space boundary

    // User interaction detection (for auto-drift)
    this.isInteracting = false;
    this.interactionTimer = null;

    // Smooth reset transition state
    this.isResetting = false;
    this.resetStartTime = 0;
    this.resetDuration = 1900; // ms
    this.resetStartPos = new THREE.Vector3();
    this.resetEndPos = new THREE.Vector3();
    this.resetStartYaw = 0;
    this.resetStartPitch = 0;
    this.resetEndYaw = 0;
    this.resetEndPitch = 0;

    this.initOrientation();
    this.bindEvents();
  }

  setInteracting() {
    this.isInteracting = true;
    if (this.interactionTimer) clearTimeout(this.interactionTimer);
    this.interactionTimer = setTimeout(() => {
      this.isInteracting = false;
    }, 2800);
  }

  initOrientation() {
    this.camera.getWorldDirection(this._forward);
    this.pitch = Math.asin(Math.max(-0.999, Math.min(0.999, this._forward.y)));
    this.yaw = Math.atan2(-this._forward.x, -this._forward.z);
    this.targetPitch = this.pitch;
    this.targetYaw = this.yaw;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  bindEvents() {
    // Touch-action on canvas prevents mobile browser scroll/gesture contention
    this.domElement.style.touchAction = 'none';

    // Pointer Events (Mouse, Touch, Stylus)
    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;

      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 1) {
        this.isDragging = true;
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;
      } else if (this.activePointers.size === 2) {
        const pts = Array.from(this.activePointers.values());
        this.prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;

      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    this.domElement.addEventListener('pointermove', (e) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 1 && this.isDragging) {
        const dx = e.clientX - this.prevMouse.x;
        const dy = e.clientY - this.prevMouse.y;
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;

        this.targetYaw -= dx * this.rotateSpeed;
        this.targetPitch -= dy * this.rotateSpeed;

        // Clamp vertical pitch to ~87.5 degrees to avoid pole flip
        const maxPitch = Math.PI * 0.485;
        this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
        this.setInteracting();
      } else if (this.activePointers.size === 2 && this.prevPinchDist !== null) {
        // Multi-touch pinch-to-zoom for mobile devices
        const pts = Array.from(this.activePointers.values());
        const currDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const distDiff = currDist - this.prevPinchDist;
        this.prevPinchDist = currDist;

        if (Math.abs(distDiff) > 1) {
          this.camera.getWorldDirection(this._pinchForward);
          const r = this.camera.position.length();
          const pinchImpulse = (distDiff * 0.005) * Math.max(0.075, r * 0.022);
          this.velocity.addScaledVector(this._pinchForward, pinchImpulse);
          this.setInteracting();
        }
      }
    });

    const onPointerEnd = (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) {
        this.isDragging = false;
        this.prevPinchDist = null;
      } else if (this.activePointers.size === 1) {
        const remaining = Array.from(this.activePointers.values())[0];
        this.prevMouse.x = remaining.x;
        this.prevMouse.y = remaining.y;
        this.prevPinchDist = null;
      }
      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    this.domElement.addEventListener('pointerup', onPointerEnd);
    this.domElement.addEventListener('pointercancel', onPointerEnd);

    // Mouse Wheel Forward/Backward Impulse
    this.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;

      this.camera.getWorldDirection(this._wheelForward);
      const r = this.camera.position.length();
      // Impulse reduced for ultra-smooth and precise thruster adjustment
      const impulse = -Math.sign(e.deltaY) * Math.max(0.075, r * 0.022);
      this.velocity.addScaledVector(this._wheelForward, impulse);
    }, { passive: false });

    // Prevent context menu on right click
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard Flight Listeners
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.handleKey(e.code, true);
      if (e.shiftKey) this.keys.boost = true;
    });

    window.addEventListener('keyup', (e) => {
      this.handleKey(e.code, false);
      if (!e.shiftKey) this.keys.boost = false;
    });
  }

  handleKey(code, isDown) {
    let matched = false;
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = isDown;
        matched = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = isDown;
        matched = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isDown;
        matched = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isDown;
        matched = true;
        break;
      case 'Space':
      case 'KeyE':
        this.keys.up = isDown;
        matched = true;
        break;
      case 'KeyC':
      case 'KeyQ':
      case 'ControlLeft':
      case 'ControlRight':
        this.keys.down = isDown;
        matched = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.boost = isDown;
        matched = true;
        break;
    }
    if (matched && isDown) {
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;
    }
  }

  /**
   * Smoothly interpolate camera position and look direction to the reference shot
   */
  resetTo(targetPos, lookAtTarget) {
    this.isResetting = true;
    this.resetStartTime = performance.now();
    this.resetStartPos.copy(this.camera.position);
    this.resetEndPos.copy(targetPos);

    this.resetStartYaw = this.yaw;
    this.resetStartPitch = this.pitch;

    const dir = lookAtTarget.clone().sub(targetPos).normalize();
    this.resetEndPitch = Math.asin(Math.max(-0.999, Math.min(0.999, dir.y)));
    this.resetEndYaw = Math.atan2(-dir.x, -dir.z);

    // Calculate shortest angular path around circle for yaw
    let diffYaw = (this.resetEndYaw - this.resetStartYaw) % (Math.PI * 2);
    if (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    if (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
    this.resetEndYaw = this.resetStartYaw + diffYaw;

    this.velocity.set(0, 0, 0);
  }

  update(delta) {
    if (this.isResetting) {
      const elapsed = performance.now() - this.resetStartTime;
      const progress = Math.min(elapsed / this.resetDuration, 1.0);
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(this.resetStartPos, this.resetEndPos, ease);
      this.yaw = THREE.MathUtils.lerp(this.resetStartYaw, this.resetEndYaw, ease);
      this.pitch = THREE.MathUtils.lerp(this.resetStartPitch, this.resetEndPitch, ease);
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

      if (progress >= 1.0) {
        this.isResetting = false;
      }
      return;
    }

    // Smooth view damping (frame-rate independent: 1 - exp(-k * dt))
    const dampFactor = 1.0 - Math.exp(-this.rotDampingCoeff * delta);
    this.yaw += (this.targetYaw - this.yaw) * dampFactor;
    this.pitch += (this.targetPitch - this.pitch) * dampFactor;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Direction vectors in world space (reusing pooled vectors to eliminate GC pauses)
    this.camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this.camera.up).normalize();

    this._moveDir.set(0, 0, 0);
    if (this.keys.forward) this._moveDir.add(this._forward);
    if (this.keys.backward) this._moveDir.sub(this._forward);
    if (this.keys.right) this._moveDir.add(this._right);
    if (this.keys.left) this._moveDir.sub(this._right);
    if (this.keys.up) this._moveDir.add(this._up);
    if (this.keys.down) this._moveDir.sub(this._up);

    const r = this.camera.position.length();

    // Scale speed dynamically with distance from the black hole
    // Deep space: ~0.92 units/s; Horizon skim (r -> 1.015): micro-thrusters (~0.010 units/s) for delicate maneuvering without jitter
    const proximity = Math.max(0.0, r - this.minRadius);
    let baseSpeed = Math.max(0.010, Math.min(0.92, (proximity * 0.22 + 0.012)));
    if (this.keys.boost) baseSpeed *= 2.8;

    if (this._moveDir.lengthSq() > 0.0001) {
      this._moveDir.normalize();
      const accel = baseSpeed * 5.2;
      this.velocity.addScaledVector(this._moveDir, accel * delta);
    }

    // Vacuum damping (spacecraft flight-assist thrusters)
    const damping = Math.exp(-3.8 * delta);
    this.velocity.multiplyScalar(damping);

    // Apply movement
    this.camera.position.addScaledVector(this.velocity, delta);

    // Event Horizon & Deep Space Boundary Safety
    const dist = this.camera.position.length();
    if (dist < this.minRadius) {
      this.camera.position.setLength(this.minRadius);
      this._radial.copy(this.camera.position).normalize();
      const vDot = this.velocity.dot(this._radial);
      if (vDot < 0) {
        this.velocity.addScaledVector(this._radial, -vDot);
      }
    } else if (dist > this.maxRadius) {
      this.camera.position.setLength(this.maxRadius);
    }
  }
}
