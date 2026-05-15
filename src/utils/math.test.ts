import { equal, throws } from '../test/assert';
import { clamp, hexToRgba, smoothstep } from './math';

export const tests = [
  {
    name: 'clamp keeps values inside the provided range',
    run() {
      equal(clamp(10, 0, 5), 5);
      equal(clamp(-2, 0, 5), 0);
      equal(clamp(3, 0, 5), 3);
    },
  },
  {
    name: 'smoothstep interpolates between edges',
    run() {
      equal(smoothstep(0, 10, -1), 0);
      equal(smoothstep(0, 10, 11), 1);
      equal(Math.round(smoothstep(0, 10, 5) * 100) / 100, 0.5);
    },
  },
  {
    name: 'hexToRgba converts hex colors to rgba',
    run() {
      equal(hexToRgba('#38bdf8', 0.4), 'rgba(56, 189, 248, 0.4)');
      equal(hexToRgba('#fff', 2), 'rgba(255, 255, 255, 1)');
      throws(() => hexToRgba('nope'), /Invalid hex color/);
    },
  },
];
