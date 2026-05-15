import type { EnergyLayer, ScenarioDefinition } from '../model/types';
import { clamp, smoothstep } from '../utils/math';

export interface Point {
  x: number;
  y: number;
}

function stateModulation(layer: EnergyLayer, progress: number, scenario: ScenarioDefinition): number {
  const direction = scenario.direction === 'up' ? 1 : -1;

  switch (layer.state.zeroAxisBehavior) {
    case 'tangle':
      return Math.sin(progress * Math.PI * 12 + layer.phase) * 0.42;
    case 'cross':
      return (smoothstep(0.42, 0.68, progress) * 2 - 1) * direction;
    default:
      break;
  }

  if (layer.state.gapMode === 'continuous') {
    return (Math.floor(progress * 6) / 6 - 0.42) * direction;
  }

  if (layer.state.gapMode === 'separate') {
    return Math.sin(progress * Math.PI * 8) > 0.45 ? 0.65 * direction : -0.1 * direction;
  }

  if (layer.state.id === 'hiddenMomentumLack') {
    const divergence = layer.role === 'smaller' ? -1 : 1;
    return direction * divergence * (0.4 - smoothstep(0.2, 0.92, progress) * 0.75);
  }

  return direction * (layer.state.polarity || 1) * 0.5;
}

export function buildLayerWave(layer: EnergyLayer, scenario: ScenarioDefinition, width: number, leftPadding: number, rightPadding: number): Point[] {
  const drawableWidth = width - leftPadding - rightPadding;
  const points: Point[] = [];

  for (let step = 0; step <= 160; step += 1) {
    const progress = step / 160;
    const x = leftPadding + progress * drawableWidth;
    const carrier = Math.sin(progress * Math.PI * 2 * layer.frequency + layer.phase);
    const harmonic = Math.sin(progress * Math.PI * 6 + layer.phase * 0.65) * 0.28;
    const envelope = 0.75 + smoothstep(0.06, 0.3, progress) * 0.35 - smoothstep(0.72, 0.98, progress) * 0.25;
    const stateOffset = stateModulation(layer, progress, scenario) * layer.amplitude;
    const y = layer.zeroY - (carrier + harmonic) * layer.amplitude * envelope - stateOffset;
    points.push({ x, y });
  }

  return points;
}

export function buildObservationWave(layers: EnergyLayer[], scenario: ScenarioDefinition, width: number, leftPadding: number, rightPadding: number, baseY: number): Point[] {
  const drawableWidth = width - leftPadding - rightPadding;
  const points: Point[] = [];
  const direction = scenario.direction === 'up' ? 1 : -1;

  for (let step = 0; step <= 180; step += 1) {
    const progress = step / 180;
    const x = leftPadding + progress * drawableWidth;
    const combined = layers.reduce((sum, layer, index) => {
      const weight = layer.role === 'smaller' ? 0.42 : layer.role === 'current' ? 0.36 : 0.22;
      return sum + Math.sin(progress * Math.PI * 2 * (index + 1.15) + layer.phase) * weight * layer.uploadStrength;
    }, 0);
    const drift = direction * smoothstep(0.12, 0.85, progress) * 22;
    points.push({ x, y: baseY - clamp(combined, -1.4, 1.4) * 28 - drift });
  }

  return points;
}

export function pointsToPath(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }
  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`, `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`);
}
