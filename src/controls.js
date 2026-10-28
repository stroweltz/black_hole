import * as THREE from 'three';

/**
 * Cinematic 6-DOF Space Flight & Free Mouse-Look / Touch Controller
 * - 360° Free Mouse & Touch Drag: rotate view in arbitrary directions with inertia and damping
 * - 2-Finger Pinch: intuitive forward/backward thrust zoom on mobile
 * - Virtual Analog Joystick: proportional 360° flight maneuvering on touch devices
 * - Altitude & Boost Controls: climb (▲), descent (▼), and turbo boost (🚀)
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

    // Mobile Analog Input (Joystick: x [-1, 1] strafe, y [-1, 1] thrust)
    this.analogMove = new THREE.Vector2(0, 0);

    // Mouse & Touch drag configuration
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.rotateSpeed = 0.0026;
    this.rotDamping = 0.12;

    // Multi-touch gestures
    this.isPinching = false;
    this.prevPinchDist = 0;
    this.lastTapTime = 0;
    this.lastTapPos = { x: 0, y: 0 };

    // Boundary constraints (Schwarzschild radius = 1.0, horizon = 1.005)
    // Allows flying deep to the razor edge of the horizon (r = 1.015) where shadow engulfs ~97.4% of the sky!
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
    this.initTouchControls();
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
    // --- Mouse Drag Listeners ---
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

    // --- Touch Screen Gestures (1-Finger Rotation & 2-Finger Pinch Thrust) ---
    this.domElement.addEventListener('touchstart', (e) => {
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.isDragging = true;
        this.isPinching = false;
        this.prevMouse.x = touch.clientX;
        this.prevMouse.y = touch.clientY;

        // Double tap on canvas toggles UI
        const now = performance.now();
        const dist = Math.hypot(touch.clientX - this.lastTapPos.x, touch.clientY - this.lastTapPos.y);
        if (now - this.lastTapTime < 320 && dist < 32) {
          if (typeof window.toggleUIVisibility === 'function') {
            window.toggleUIVisibility();
          }
          this.lastTapTime = 0;
        } else {
          this.lastTapTime = now;
          this.lastTapPos.x = touch.clientX;
          this.lastTapPos.y = touch.clientY;
        }
      } else if (e.touches.length >= 2) {
        this.isDragging = false;
        this.isPinching = true;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        this.prevPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging && !this.isPinching) return;
      this.setInteracting();

      if (this.isDragging && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - this.prevMouse.x;
        const dy = touch.clientY - this.prevMouse.y;
        this.prevMouse.x = touch.clientX;
        this.prevMouse.y = touch.clientY;

        this.targetYaw -= dx * this.rotateSpeed * 1.15;
        this.targetPitch -= dy * this.rotateSpeed * 1.15;

        const maxPitch = Math.PI * 0.485;
        this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));
      } else if (this.isPinching && e.touches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const deltaDist = dist - this.prevPinchDist;
        this.prevPinchDist = dist;

        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        const r = this.camera.position.length();
        // Pinch expansion -> forward impulse; pinch compression -> backward impulse
        const impulse = deltaDist * Math.max(0.002, r * 0.00065);
        this.velocity.addScaledVector(forward, impulse);
      }
    }, { passive: true });

    const handleTouchEnd = (e) => {
      if (e.touches.length === 0) {
        this.isDragging = false;
        this.isPinching = false;
      } else if (e.touches.length === 1) {
        this.isPinching = false;
        this.isDragging = true;
        this.prevMouse.x = e.touches[0].clientX;
        this.prevMouse.y = e.touches[0].clientY;
      }
    };

    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    // --- Mouse Wheel Forward/Backward Impulse ---
    this.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setInteracting();
      if (this.isResetting) this.isResetting = false;

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      const r = this.camera.position.length();
      // Impulse reduced 8x total for ultra-smooth and precise thruster adjustment
      const impulse = -Math.sign(e.deltaY) * Math.max(0.075, r * 0.022);
      this.velocity.addScaledVector(forward, impulse);
    }, { passive: false });

    // Prevent context menu on right click
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Keyboard Flight Listeners ---
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

  /**
   * Initialize on-screen touch flight controls (Analog Joystick & Thrusters)
   */
  initTouchControls() {
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    const btnTouchUp = document.getElementById('btn-touch-up');
    const btnTouchDown = document.getElementById('btn-touch-down');
    const btnTouchBoost = document.getElementById('btn-touch-boost');

    if (joystickBase && joystickKnob) {
      let activeTouchId = null;
      let baseCenter = { x: 0, y: 0 };
      const maxRadius = 36; // px

      const onJoyStart = (e) => {
        if (activeTouchId !== null) return;
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        activeTouchId = touch.identifier !== undefined ? touch.identifier : 'mouse';

        const rect = joystickBase.getBoundingClientRect();
        baseCenter.x = rect.left + rect.width / 2;
        baseCenter.y = rect.top + rect.height / 2;

        this.setInteracting();
        if (this.isResetting) this.isResetting = false;

        updateJoyKnob(touch.clientX, touch.clientY);
      };

      const updateJoyKnob = (clientX, clientY) => {
        let dx = clientX - baseCenter.x;
        let dy = clientY - baseCenter.y;
        const dist = Math.hypot(dx, dy);

        if (dist > maxRadius) {
          dx = (dx / dist) * maxRadius;
          dy = (dy / dist) * maxRadius;
        }

        joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
        // Proportional normalized vector [-1, 1]
        this.analogMove.x = dx / maxRadius;
        this.analogMove.y = dy / maxRadius;
      };

      const onJoyMove = (e) => {
        if (activeTouchId === null) return;
        let touch = null;
        if (e.changedTouches) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
              touch = e.changedTouches[i];
              break;
            }
          }
        } else if (activeTouchId === 'mouse') {
          touch = e;
        }
        if (!touch) return;
        e.preventDefault();
        this.setInteracting();
        updateJoyKnob(touch.clientX, touch.clientY);
      };

      const onJoyEnd = (e) => {
        if (activeTouchId === null) return;
        let matched = false;
        if (e.changedTouches) {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
              matched = true;
              break;
            }
          }
        } else if (activeTouchId === 'mouse') {
          matched = true;
        }
        if (!matched) return;

        activeTouchId = null;
        joystickKnob.style.transform = 'translate(0px, 0px)';
        this.analogMove.set(0, 0);
      };

      joystickBase.addEventListener('touchstart', onJoyStart, { passive: false });
      window.addEventListener('touchmove', onJoyMove, { passive: false });
      window.addEventListener('touchend', onJoyEnd);
      window.addEventListener('touchcancel', onJoyEnd);

      // Support mouse preview for testing in DevTools Responsive Mode
      joystickBase.addEventListener('mousedown', onJoyStart);
      window.addEventListener('mousemove', (e) => {
        if (activeTouchId === 'mouse') {
          this.setInteracting();
          updateJoyKnob(e.clientX, e.clientY);
        }
      });
      window.addEventListener('mouseup', (e) => {
        if (activeTouchId === 'mouse') {
          activeTouchId = null;
          joystickKnob.style.transform = 'translate(0px, 0px)';
          this.analogMove.set(0, 0);
        }
      });
    }

    // Touch Altitude Elevation Controls
    if (btnTouchUp) {
      const startUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.keys.up = true;
        btnTouchUp.classList.add('active');
        this.setInteracting();
        if (this.isResetting) this.isResetting = false;
      };
      const endUp = (e) => {
        e.preventDefault();
        this.keys.up = false;
        btnTouchUp.classList.remove('active');
      };
      btnTouchUp.addEventListener('touchstart', startUp, { passive: false });
      btnTouchUp.addEventListener('touchend', endUp);
      btnTouchUp.addEventListener('touchcancel', endUp);
      btnTouchUp.addEventListener('mousedown', startUp);
      btnTouchUp.addEventListener('mouseup', endUp);
    }

    if (btnTouchDown) {
      const startDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.keys.down = true;
        btnTouchDown.classList.add('active');
        this.setInteracting();
        if (this.isResetting) this.isResetting = false;
      };
      const endDown = (e) => {
        e.preventDefault();
        this.keys.down = false;
        btnTouchDown.classList.remove('active');
      };
      btnTouchDown.addEventListener('touchstart', startDown, { passive: false });
      btnTouchDown.addEventListener('touchend', endDown);
      btnTouchDown.addEventListener('touchcancel', endDown);
      btnTouchDown.addEventListener('mousedown', startDown);
      btnTouchDown.addEventListener('mouseup', endDown);
    }

    // Touch Turbo Boost (Toggle on mobile tap)
    if (btnTouchBoost) {
      const toggleBoost = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.keys.boost = !this.keys.boost;
        btnTouchBoost.classList.toggle('active', this.keys.boost);
        this.setInteracting();
      };
      btnTouchBoost.addEventListener('click', toggleBoost);
    }
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

    // Analog stick contribution (analogMove.y: -1 = forward, +1 = backward; analogMove.x: -1 = left, +1 = right)
    if (Math.abs(this.analogMove.y) > 0.04) {
      moveDir.addScaledVector(forward, -this.analogMove.y);
    }
    if (Math.abs(this.analogMove.x) > 0.04) {
      moveDir.addScaledVector(right, this.analogMove.x);
    }

    const r = this.camera.position.length();

    // Scale speed dynamically with distance from the black hole (reduced by 8x total for ultra-smooth cinematic piloting)
    // Deep space: ~0.92 units/s; Horizon skim (r -> 1.015): delicate exploration (~0.012 units/s)
    let baseSpeed = Math.max(0.012, Math.min(0.92, ((r - 1.0) * 0.85 + 0.15) * 0.125));
    if (this.keys.boost) baseSpeed *= 2.8;

    if (moveDir.lengthSq() > 0.0001) {
      const analogMagnitude = Math.min(1.0, Math.max(
        (this.keys.forward || this.keys.backward || this.keys.left || this.keys.right || this.keys.up || this.keys.down) ? 1.0 : 0.0,
        this.analogMove.length()
      ));
      moveDir.normalize();
      const accel = baseSpeed * 5.2 * (analogMagnitude > 0 ? analogMagnitude : 1.0);
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
