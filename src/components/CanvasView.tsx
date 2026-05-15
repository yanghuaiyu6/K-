import { modelConfig } from '../model/config';
import { buildObservationWave, buildLayerWave, pointsToPath } from '../render/waves';
import type { EnergyLayer, ScenarioDefinition } from '../model/types';
import { hexToRgba } from '../utils/math';

interface CanvasViewProps {
  layers: EnergyLayer[];
  scenario: ScenarioDefinition;
}

export function CanvasView({ layers, scenario }: CanvasViewProps) {
  const observationPath = pointsToPath(buildObservationWave(
    layers,
    scenario,
    modelConfig.canvasWidth,
    modelConfig.leftPadding,
    modelConfig.rightPadding,
    74,
  ));
  const uploadX = modelConfig.canvasWidth - modelConfig.rightPadding + 62;

  return (
    <svg className="canvas-view" viewBox={`0 0 ${modelConfig.canvasWidth} ${modelConfig.canvasHeight}`} role="img" aria-label="MACD 多级别递归能量模型画布">
      <defs>
        <radialGradient id="particleGlow">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="rgba(103,232,249,0)" />
        </radialGradient>
        <linearGradient id="observationGradient" x1="0" x2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="100%" height="100%" rx="28" fill="#07111f" />
      <text x="44" y="42" className="canvas-title">MACD 多级别递归能量模型</text>
      <text x="44" y="70" className="canvas-subtitle">当前级别的单位调整周期之间 = 大级别的单位调整周期之内</text>

      <g className="observation-band">
        <rect x="32" y="92" width="1116" height="76" rx="20" fill="rgba(15,23,42,0.92)" stroke="rgba(148,163,184,0.22)" />
        <text x="52" y="124" className="band-label">合成观察波</text>
        <path d={observationPath} fill="none" stroke="url(#observationGradient)" strokeWidth="4" strokeLinecap="round" />
      </g>

      {layers.map((layer) => {
        const wavePath = pointsToPath(buildLayerWave(layer, scenario, modelConfig.canvasWidth, modelConfig.leftPadding, modelConfig.rightPadding));
        const layerTop = layer.zeroY - modelConfig.layerHeight / 2;
        return (
          <g key={layer.timeframe.id}>
            <rect x="32" y={layerTop} width="1116" height={modelConfig.layerHeight} rx="18" fill={hexToRgba(layer.timeframe.color, 0.08)} stroke={hexToRgba(layer.timeframe.color, 0.28)} />
            <line x1={modelConfig.leftPadding} x2={modelConfig.canvasWidth - modelConfig.rightPadding} y1={layer.zeroY} y2={layer.zeroY} stroke={hexToRgba(layer.timeframe.color, 0.56)} strokeDasharray={modelConfig.zeroAxisDash.join(' ')} />
            <text x="50" y={layerTop + 28} className="timeframe-label" fill={layer.timeframe.color}>{layer.timeframe.label}</text>
            <text x="50" y={layerTop + 52} className="role-label">{layer.role === 'smaller' ? '小一级别：先运行' : layer.role === 'current' ? '当前级别：被推动' : '大一级别：周期之内'}</text>
            <path d={wavePath} fill="none" stroke={layer.timeframe.color} strokeWidth={layer.role === 'current' ? 4 : 3} strokeLinecap="round" filter="drop-shadow(0 0 10px rgba(125,211,252,.28))" />
            <circle cx={modelConfig.canvasWidth - modelConfig.rightPadding + 14} cy={layer.zeroY} r="5" fill={layer.timeframe.color} />
          </g>
        );
      })}

      <g className="upload-column">
        <text x={uploadX - 34} y="226" className="upload-label">能量上传</text>
        <line x1={uploadX} x2={uploadX} y1="250" y2="520" stroke="rgba(103,232,249,0.26)" strokeWidth="3" strokeLinecap="round" />
        {Array.from({ length: modelConfig.uploadParticleCount }).map((_, index) => {
          const firstLayer = layers[0];
          const lastLayer = layers[layers.length - 1];
          const y = firstLayer.zeroY + ((lastLayer.zeroY - firstLayer.zeroY) * index) / (modelConfig.uploadParticleCount - 1);
          const radius = 7 + (index % 3) * 2;
          return <circle key={index} cx={uploadX} cy={y} r={radius} fill="url(#particleGlow)" opacity={0.4 + index / 18} />;
        })}
      </g>
    </svg>
  );
}
