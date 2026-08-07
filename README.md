# ReplayTrader 中文版

按 [ReplayTrader](https://replaytrader.app/) 的核心流程复刻的中文练习软件：新建会话 → 逐根回放交易 → 结束复盘。

当前版本使用本地模拟行情，不连接真实券商。

## 核心流程

1. **新建练习会话**：选择品种、周期、本金，可开启盲盒模式
2. **回放交易台**：深色 K 线图表、市价/限价/止损单、止盈止损、持仓与成交
3. **回放控制**：0.5x～50x、逐根前进后退、进度条拖动
4. **结束报告**：净盈亏、胜率、获利因子、最大回撤、成交明细

快捷键：`Space` 播放/暂停，`←/→` 逐根，`B` 买入，`S` 卖出，`X` 平仓。

## 安装 APK

- [Release 页面](https://github.com/yanghuaiyu6/K-/releases/tag/v0.1.0-debug)
- [直接下载 APK](https://github.com/yanghuaiyu6/K-/releases/download/v0.1.0-debug/replay-trader-cn-debug.apk)

请用系统浏览器或 Chrome 下载，不要用微信内置浏览器。

## 本地运行

```bash
npm install
npm run dev
```

```bash
npm run build
npm test
npm run apk:debug
```
