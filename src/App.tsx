import { useMemo, useState } from 'react';
import { CanvasView } from './components/CanvasView';
import { ControlPanel } from './components/ControlPanel';
import { buildLayers, getAdjacentTimeframes } from './model/layers';
import { scenarios } from './model/scenarios';
import type { ScenarioDefinition } from './model/types';
import './styles.css';

export default function App() {
  const [scenario, setScenario] = useState<ScenarioDefinition>(scenarios[0]);
  const layers = useMemo(() => buildLayers(scenario), [scenario]);
  const adjacent = useMemo(() => getAdjacentTimeframes(scenario.currentTimeframeId), [scenario.currentTimeframeId]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Recursive MACD Energy</p>
          <h1>MACD 多级别递归能量模型可视化系统</h1>
          <p>每个时间级别拥有独立零轴；小级别先运行，能量通过右侧光点上传，并推动当前级别进入大级别单位调整周期之内。</p>
        </div>
        <div className="relationship-card" aria-label="级别关系">
          <span>小一级别：{adjacent.smaller.label}</span>
          <strong>当前：{adjacent.current.label}</strong>
          <span>大一级别：{adjacent.larger.label}</span>
        </div>
      </section>

      <section className="workspace">
        <CanvasView layers={layers} scenario={scenario} />
        <ControlPanel scenario={scenario} onScenarioChange={setScenario} />
      </section>
    </main>
  );
}
