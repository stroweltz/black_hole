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

    // Mouse drag configuration
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.rotateSpeed = 0.0026;
    this.rotDamping = 0.12;

    // Boundary constraints (Schwarzschild radius = 1.0, horizon = 1.015)
    // Allows flying deep into the sub-photon sphere (r = 1.06) where shadow engulfs ~85-90% of the sky!
    this.minRadius = 1.06;
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
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.pitch = Math.asin(Math.max(-0.999, Math.min(0.999, dir.y)));
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.targetPitch = this.pitch;
    this.targetYaw = this.yaw;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  bindEvents() {
    // Mouse Drag Listeners
    this.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.isDragging = true;
        this.prevMouse.x = e.clientX;
        this.prevMouse.y = e.clientY;
        this.setInteracting();
        if (this.isResetting) this.isResetting = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
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
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Mouse Wheel Forward/Backward Impulse
    this.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      const r = this.camera.position.length();
      // Impulse reduced 4x for smooth and controllable thruster adjustment
      const impulse = -Math.sign(e.deltaY) * Math.max(0.15, r * 0.045);
      this.velocity.addScaledVector(forward, impulse);
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

    // Smooth view damping
    this.yaw += (this.targetYaw - this.yaw) * this.rotDamping;
    this.pitch += (this.targetPitch - this.pitch) * this.rotDamping;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Direction vectors in world space
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const moveDir = new THREE.Vector3();
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.right) moveDir.add(right);
    if (this.keys.left) moveDir.sub(right);
    if (this.keys.up) moveDir.add(up);
    if (this.keys.down) moveDir.sub(up);

    const r = this.camera.position.length();

    // Scale speed dynamically with distance from the black hole (reduced 4x for smooth cinematic piloting)
    // Deep space: ~1.85 units/s; Horizon skim (r -> 1.06): delicate exploration (~0.055 units/s)
    let baseSpeed = Math.max(0.055, Math.min(1.85, ((r - 1.0) * 0.85 + 0.15) * 0.25));
    if (this.keys.boost) baseSpeed *= 2.8;

    if (moveDir.lengthSq() > 0.0001) {
      moveDir.normalize();
      const accel = baseSpeed * 5.2;
      this.velocity.addScaledVector(moveDir, accel * delta);
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
      const radial = this.camera.position.clone().normalize();
      const vDot = this.velocity.dot(radial);
      if (vDot < 0) {
        this.velocity.sub(radial.multiplyScalar(vDot));
      }
    } else if (dist > this.maxRadius) {
      this.camera.position.setLength(this.maxRadius);
    }
  }
}
