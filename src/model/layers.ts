import { modelConfig } from './config';
import { getEnergyState } from './states';
import { findTimeframeIndex, timeframes } from './timeframes';
import type { EnergyLayer, ScenarioDefinition } from './types';
import { clamp } from '../utils/math';

export function getAdjacentTimeframes(currentTimeframeId: string) {
  const currentIndex = findTimeframeIndex(currentTimeframeId);
  const smallerIndex = clamp(currentIndex - 1, 0, timeframes.length - 1);
  const largerIndex = clamp(currentIndex + 1, 0, timeframes.length - 1);

  return {
    smaller: timeframes[smallerIndex],
    current: timeframes[currentIndex],
    larger: timeframes[largerIndex],
  };
}

export function buildLayers(scenario: ScenarioDefinition): EnergyLayer[] {
  const state = getEnergyState(scenario.stateId);
  const currentIndex = findTimeframeIndex(scenario.currentTimeframeId);
  const lowerBound = Math.max(0, currentIndex - 1);
  const upperBound = Math.min(timeframes.length - 1, currentIndex + 1);
  const selectedTimeframes = timeframes.slice(lowerBound, upperBound + 1);
  const directionSign = scenario.direction === 'up' ? 1 : -1;

  return selectedTimeframes.map((timeframe, index) => {
    const absoluteIndex = lowerBound + index;
    const relative = absoluteIndex - currentIndex;
    const role = relative < 0 ? 'smaller' : relative > 0 ? 'larger' : 'current';
    const yTop = modelConfig.observationHeight + index * (modelConfig.layerHeight + modelConfig.layerGap);

    return {
      timeframe,
      index,
      role,
      zeroY: yTop + modelConfig.layerHeight / 2,
      amplitude: (30 - Math.abs(relative) * 4) * state.intensity,
      frequency: 1.6 / Math.max(1, timeframe.minutes / selectedTimeframes[0].minutes) + 0.18 * index,
      phase: scenario.phaseShift + index * 0.75 + directionSign * 0.2,
      uploadStrength: clamp(state.intensity * (role === 'smaller' ? 1.15 : role === 'current' ? 0.92 : 0.68), 0.2, 1.5),
      state,
    } satisfies EnergyLayer;
  });
}
