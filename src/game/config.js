export const gameConfig = {
  title: 'Lumen Drift',
  duration: 60,
  player: { speed: 8, radius: 0.55 },
  stage: {
    name: 'Night Shift 01',
    bounds: 12,
    requiredLumens: 6,
    lumens: [
      [-7, -5], [-4, 6], [0, -7], [3, 4], [7, -3], [8, 7], [-8, 3], [0, 7],
    ],
    storms: [
      { position: [-2, -2], radius: 1.05, speed: 1.3 },
      { position: [5, 1], radius: 1.25, speed: -0.85 },
      { position: [-7, 6], radius: 0.9, speed: 1.6 },
    ],
  },
}
