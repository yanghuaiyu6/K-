# 复盘交易室（Replay Trader 中文版）

面向中文用户的历史行情回放与模拟交易练习应用。当前版本使用本地生成的演示行情，不连接券商，也不会执行真实交易。

## 已实现

- 多品种 5 分钟 K 线与成交量展示
- 播放、暂停、逐根移动及 0.5x～4x 倍速回放
- 市价、限价和止损模拟委托
- 多空持仓、加减仓、反手、平仓和实时盈亏
- 当前持仓、待成交委托与成交记录
- 中文交易界面和练习风险提示
- Android 手机安装包（Capacitor）

## 直接安装 APK（推荐）

仓库内已提供可直接安装的调试包：

- [`releases/replay-trader-cn-debug.apk`](./releases/replay-trader-cn-debug.apk)

安装步骤：

1. 把 APK 传到手机（微信/浏览器下载均可）
2. 打开文件，允许「安装未知应用」
3. 安装完成后启动「复盘交易室」

说明：

- 这是 debug 签名包，适合自测，不是应用商店正式发布版
- 应用离线可用，行情为本地模拟数据
- 包名：`com.replaytrader.cn`

## 本地网页运行

```bash
npm install
npm run dev
```

生产构建和测试：

```bash
npm run build
npm test
```

## 重新打包 APK

需要本机安装 JDK 21+ 与 Android SDK。

```bash
npm install
npm run apk:debug
```

生成位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

> 本项目中的行情、报价和成交均为本地模拟数据，仅用于产品演示与交易练习，不构成投资建议。
