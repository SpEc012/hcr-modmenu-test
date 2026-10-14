// A compact original 2D hill-climb car. Arcade model: while its wheels are on the ground
// the chassis rides the terrain surface (no tunnelling); in the air it moves ballistically
// and can spin for flips. Stable at any speed. Original code.

const GRAV = 1500; // px/s^2 baseline

export function makeCar(terrain, x) {
  return {
    x,
    y: terrain.height(x) - 18, // rest on the surface (wheelRadius above ground)
    vx: 0,
    vy: 0,
    angle: 0,
    angVel: 0,
    wheelBase: 24,
    wheelRadius: 18,
    onGround: true,
    airborne: false,
    fuel: 1,
    crashed: false,
    flips: 0,
    lastUp: 1,
    distance: 0,
    startX: x,
  };
}

// Multipliers derived from upgrade levels (0..max).
export function carStats(levels, parts) {
  const frac = (id) => {
    const p = parts.find((q) => q.id === id);
    return p ? (levels?.[id] ?? 1) / p.max : 0;
  };
  return {
    engine: 1 + frac('engine') * 2.4,
    suspension: 0.6 + frac('suspension') * 1.0,
    grip: 0.65 + frac('tires') * 0.9,
    fuelMax: 11 + frac('fuel') * 26, // seconds of throttle at full
    downforce: frac('downforce'),
  };
}

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const safe = (x) => (Number.isFinite(x) ? Math.max(0, x) : 1);

export function step(car, terrain, stats, input, dt, features) {
  if (car.crashed && !features.noCrash) return;
  const g = GRAV * safe((terrain.profile.gravity ?? 1) * (features.gravityScale ?? 1));
  const wb = car.wheelBase;
  const throttle = car.fuel > 0 ? input.throttle : 0;

  // integrate under gravity
  car.vy += g * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // ground under the two wheels
  const gF = terrain.height(car.x + wb);
  const gR = terrain.height(car.x - wb);
  const gm = (gF + gR) / 2;
  const rest = gm - car.wheelRadius; // chassis-centre height when resting
  const slope = (gF - gR) / (2 * wb);
  const inv = 1 / Math.hypot(1, slope);
  const sinT = slope * inv; // sin of the surface angle (>0 => uphill toward +x)

  if (car.y >= rest - 1) {
    // ---- grounded: ride the surface ----
    car.onGround = true;
    car.airborne = false;
    car.y = rest;

    const torque = (features.torqueScale ?? 1);
    const drive = throttle * stats.engine * torque * 1000 * terrain.profile.grip * stats.grip;
    car.vx += inv * drive * dt; // push along the surface tangent
    car.vx += -g * sinT * dt; // gravity component along the slope (roll downhill)
    car.vx *= 1 - 1.3 * dt; // rolling resistance

    const topSpeed = 520 + stats.engine * 230;
    car.vx = clampNum(car.vx, -topSpeed * 0.5, topSpeed);

    // chassis angle eases toward the slope; throttle tilts it back (wheelie)
    const targetAngle = Math.atan2(gF - gR, 2 * wb);
    const ease = Math.min(1, (9 + 8 * stats.suspension) * dt);
    car.angle += (targetAngle - car.angle) * ease;
    car.angVel = -throttle * (2.6 - stats.downforce * 1.2); // carried into the air on take-off
    car.vy = car.vx * slope; // track the surface
    if (car.vy > 0) car.vy = Math.min(car.vy, 60);
  } else {
    // ---- airborne ----
    car.onGround = false;
    car.airborne = true;
    car.vx *= 1 - 0.12 * dt;
    car.angVel += throttle * 1.3 * dt; // a little air control
    car.angVel *= 1 - 0.25 * dt;
    car.angle += car.angVel * dt;
  }

  // flip counting (full rotations while airborne)
  const up = Math.cos(car.angle);
  if (car.airborne && car.lastUp >= 0 && up < 0) car.flips++;
  car.lastUp = up;

  // fuel burn
  if (throttle !== 0 && car.fuel > 0) car.fuel = Math.max(0, car.fuel - Math.abs(throttle) * dt / stats.fuelMax);

  // crash: landed too far past upright
  const angN = Math.atan2(Math.sin(car.angle), Math.cos(car.angle));
  if (!features.noCrash && !car.airborne && Math.abs(angN) > 2.2) car.crashed = true;
  if (features.noCrash) car.crashed = false;

  car.distance = Math.max(car.distance, (car.x - car.startX) / 40); // ~40px per metre
}

export { GRAV };
