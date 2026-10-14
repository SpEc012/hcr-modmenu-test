// Procedural hilly terrain. Deterministic per (stage seed), sampled as a smooth height
// function so physics and rendering agree. Original code.

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// A stage's terrain is a sum of sine waves whose amplitude/roughness come from its profile.
export function makeTerrain(stageId, profile) {
  const seed = hashSeed(stageId);
  const waves = [];
  let s = seed;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  const octaves = 6;
  for (let i = 0; i < octaves; i++) {
    waves.push({
      amp: profile.amp * (0.6 + rand() * 0.8) * Math.pow(0.62, i),
      freq: profile.freq * Math.pow(1.9, i) * (0.8 + rand() * 0.4),
      phase: rand() * Math.PI * 2,
    });
  }
  const start = 240; // flat launch pad before the hills begin
  function height(x) {
    if (x < start) return profile.base;
    const xx = x - start;
    let y = profile.base;
    const ramp = Math.min(1, xx / 400); // ease hills in
    for (const w of waves) y += Math.sin(xx * w.freq + w.phase) * w.amp * ramp;
    return y;
  }
  function slope(x) {
    const d = 1.5;
    return (height(x + d) - height(x - d)) / (2 * d);
  }
  return { height, slope, profile, start };
}

export const STAGE_PROFILES = {
  countryside: { base: 420, amp: 60, freq: 0.006, grip: 1.0, gravity: 1.0, sky: ['#8fd3ff', '#dff3ff'], ground: '#6bbf59', ground2: '#4f9e42' },
  desert: { base: 430, amp: 85, freq: 0.004, grip: 0.7, gravity: 1.0, sky: ['#ffd89b', '#ffe9c7'], ground: '#e4b35a', ground2: '#c8923b' },
  arctic: { base: 420, amp: 70, freq: 0.006, grip: 0.45, gravity: 1.0, sky: ['#bfe6f5', '#eef9ff'], ground: '#eef5fb', ground2: '#cfe2ef' },
  canyon: { base: 460, amp: 130, freq: 0.007, grip: 0.95, gravity: 1.0, sky: ['#ffb27a', '#ffd9b0'], ground: '#c56a3f', ground2: '#9c4e2c' },
  moon: { base: 430, amp: 95, freq: 0.005, grip: 0.85, gravity: 0.38, sky: ['#1b1b35', '#2d2d55'], ground: '#9a9aa8', ground2: '#75757f' },
  rainbow: { base: 430, amp: 110, freq: 0.0075, grip: 0.8, gravity: 1.0, sky: ['#2a0b3d', '#4a1d6b'], ground: '#ff5db1', ground2: '#9b5cff' },
};
