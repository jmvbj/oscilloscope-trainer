# DSO-2000X 数字存储示波器交互式教学实训系统
**Interactive Digital Storage Oscilloscope (DSO) Web Trainer**

[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-2f6feb?style=for-the-badge&logo=github)](https://jmvbj.github.io/oscilloscope-trainer/)
[![License](https://img.shields.io/badge/License-MIT-22e568?style=for-the-badge)](#)

> 一个面向电子工程初学者与硬件爱好者的**高仿真、零依赖、支持中英文面板实时切换**的网页版数字存储示波器交互教学系统。不仅还原了主流现代数字示波器（Keysight / Rigol / Tektronix）的前面板布局与物理采样触发逻辑，还内置了**全按键百科解析**与 **6 步交互式实操闯关课程**。

---

## 🌐 在线体验 (Live Demo)

👉 **点击直接在线操作示波器：[https://jmvbj.github.io/oscilloscope-trainer/](https://jmvbj.github.io/oscilloscope-trainer/)**

---

## ✨ 核心特性 (Key Features)

### 1. 🇨🇳 / 🇬🇧 面板丝印一键中英切换
- **中文面板**：采用国内高校实验室与工程现场通用中文术语（`伏/格`、`秒/格`、`触发电平`、`自动设置`、`单次捕获`）。
- **EN Panel**：1:1 还原主流原厂英文前面板丝印（`Volts/Div`、`Sec/Div`、`Level`、`Auto Scale`、`Single`）。
- **中/EN 双语对照**：在每个按键和旋钮上同时展示中英文名称，帮助初学者无缝过渡到全英文实验室设备。

### 2. 🎛️ 贴合真实示波器的四大物理控制分区
- **通用系统与测量区 (RUN & MEASURE)**
  - `Auto Scale`（自动设置）：自动识别输入信号频率与幅值，智能配置最佳垂直挡位、水平时基与 50% 触发电平。
  - `Run / Stop` & `Single`：支持连续实时采样、红灯波形冻结、以及抓拍瞬态脉冲的单次触发锁存（`WAIT` -> `STOP`）。
  - `Measure`（自动测量）：屏幕底部实时计算并刷新 `Vpp`（峰峰值）、`Vmax`、`Vavg`、`Freq`（频率）、`T`（周期）、`Duty`（占空比）。
  - `Cursors`（光标测量）：支持直接在荧光屏上用鼠标拖拽 `AX / BX` 时间光标与 `AY / BY` 电压光标，精确读取任意局部波形的 $\Delta T$、$1/\Delta T$ 与 $\Delta V$。
  - `Persist`（数字荧光余晖）& `X-Y Mode`（李萨如图形测双通道相位差）。
- **垂直控制区 (VERTICAL: CH1 / MATH / CH2)**
  - 双通道独立开关、标准 1-2-5 步进 `Volts/Div`（`10mV/div` ~ `10V/div`）及垂直零点位移 `Position`。
  - 屏幕右侧 F1~F5 软键菜单：支持 **`DC / AC / GND` 输入耦合切换**、**`20MHz` 带宽限制低通滤波**、**`1X / 10X` 探头衰减比**、**`Invert` 波形反相**。
  - `Math` 数学运算通道：支持 `CH1 + CH2` 叠加与 `CH1 - CH2` 差分测量。
- **水平控制区 (HORIZONTAL)**
  - 标准 1-2-5 步进水平时基 `Sec/Div`（`5μs/div` ~ `50ms/div`）与水平触发延时 `Position`（支持双击或按压归零）。
- **触发控制区 (TRIGGER)**
  - 真实边沿触发检波引擎：支持调节触发电平 `Level`（附带 `按压 50%` 一键居中）、触发方式 `AUTO / NORMAL`、触发边沿斜率 `↑ Rising / ↓ Falling`、触发源 `CH1 / CH2` 与强制触发 `Force`。
  - **真实失步模拟**：当触发电平移出信号幅值范围时，`AUTO` 模式下波形会真实呈现失步滚动，`NORMAL` 模式下进入 `WAIT` 等待触发。

### 3. ⚡ 多场景模拟被测信号发生器 (Built-in DUT Signal Generator)
顶部内置双通道信号源与 5 大经典教学测试预设：
1. **1kHz 校准方波 (`PROBE COMP`)**：模拟示波器右下角自带的 1kHz、3.3Vpp 探头补偿标准源。
2. **工频/音频正弦波**：基础周期与幅值读数练习。
3. **5V 直流电源 + 微弱纹波（测 AC 耦合）**：演示如何用 `AC` 交流耦合隔除 5V 直流偏置，再用 `50mV/div` 高灵敏度挡位放大观察毫伏级开关电源纹波。
4. **双通道相位差（测 X-Y 李萨如图形）**：演示两路同频正弦波在 90° 相位差下合成标准李萨如圆/椭圆。
5. **窄脉冲序列（测触发锁定）**：体验失步滚动波形如何通过调节 `Trigger Level` 瞬间稳定锁定。

### 4. 📖 悬停百科详解 + 6 步交互式实操闯关
- **按键/旋钮实时解析器**：鼠标悬停或点击任意按键、旋钮、软键或 BNC 接口，右侧即时展示该控件的**中英标准名称、核心物理作用、实战读数口诀与常见新手误区**。
- **6 步交互式实验课**：系统实时检测你的旋钮与按键状态，完成实操目标后自动点亮过关徽章；找不到按键时点击 **“闪烁提示目标按钮”** 即可在面板上高亮导航。

---

## 🖱️ 操作指南 (Controls Guide)

| 交互动作 | 面板操作方式 |
| :--- | :--- |
| **旋转旋钮** | 鼠标悬停在旋钮上**滚动滚轮**，或**按住鼠标左键上下/左右拖拽** |
| **旋钮按压归零** | **双击旋钮**，或点击旋钮下方的 `按压归零 / 按压 50%` 小按钮 |
| **移动测量光标** | 开启 `光标测量 (Cursors)` 后，直接在示波器屏幕上**用鼠标拖动虚线光标 `AX/BX/AY/BY`** |
| **查看按键作用** | 将鼠标悬停或点击任意按键/旋钮，查看右侧 **【按键/旋钮实时解析】** 卡片 |

---

## 🚀 本地运行 (Run Locally)

本项目采用原生 HTML5 Canvas + CSS3 + ES6 JavaScript 构建，无任何第三方框架或构建依赖：

```bash
git clone https://github.com/jmvbj/oscilloscope-trainer.git
cd oscilloscope-trainer
# 直接在浏览器中打开 index.html 即可运行
```
