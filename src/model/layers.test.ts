import { deepEqual, equal } from '../test/assert';
import { buildLayers, getAdjacentTimeframes } from './layers';
import { scenarios } from './scenarios';

const baseScenario = scenarios[0];

export const tests = [
  {
    name: 'buildLayers generates smaller, current, and larger layers around the current timeframe',
    run() {
      const layers = buildLayers(baseScenario);

      equal(layers.length, 3);
      deepEqual(layers.map((layer) => layer.role), ['smaller', 'current', 'larger']);
      deepEqual(layers.map((layer) => layer.timeframe.id), ['5m', '15m', '60m']);
    },
  },
  {
    name: 'current, smaller, and larger timeframe relationship is correct',
    run() {
      const adjacent = getAdjacentTimeframes('15m');

      equal(adjacent.smaller.id, '5m');
      equal(adjacent.current.id, '15m');
      equal(adjacent.larger.id, '60m');
    },
  },
];
