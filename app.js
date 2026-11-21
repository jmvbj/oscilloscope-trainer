/**
 * DSO-2000X 数字存储示波器交互教学系统
 * 包含：1-2-5 标准步进挡位、真实边沿触发检波、AC/DC/GND 耦合、X-Y 李萨如图形、
 * MATH 运算、光标拖拽测量、中/英/双语面板实时切换、全按键百科及 6 步互动实操课。
 */

(() => {
  'use strict';

  // ==================== 1. 标准 1-2-5 步进挡位表 ====================
  // 垂直挡位 (V/div)
  const VOLT_STEPS = [
    0.01, 0.02, 0.05,
    0.1, 0.2, 0.5,
    1.0, 2.0, 5.0, 10.0
  ];

  // 水平时基挡位 (s/div)
  const TIME_STEPS = [
    0.000005, // 5 us
    0.00001,  // 10 us
    0.00002,  // 20 us
    0.00005,  // 50 us
    0.0001,   // 100 us
    0.0002,   // 200 us
    0.0005,   // 500 us
    0.001,    // 1 ms
    0.002,    // 2 ms
    0.005,    // 5 ms
    0.01,     // 10 ms
    0.02,     // 20 ms
    0.05      // 50 ms
  ];

  // ==================== 2. 示波器全状态模型 ====================
  const state = {
    lang: 'zh', // 'zh' | 'en' | 'bi'
    running: true,
    singleArmed: false,
    persist: false,
    xyMode: false,
    showMeasure: true,
    showCursors: false,
    activeMenuChannel: 'CH1', // 'CH1' | 'CH2'

    // 水平系统 (8 行 x 10 列标准网格)
    timeIdx: 5, // 默认 200 us/div
    hPos: 0.0,  // 水平触发点偏移 (单位: div, -4 ~ +4)

    // 触发系统
    trig: {
      source: 'CH1',   // 'CH1' | 'CH2'
      mode: 'AUTO',    // 'AUTO' | 'NORMAL' | 'SINGLE'
      slope: 'RISING', // 'RISING' | 'FALLING'
      level: 1.65,     // V
      isTriggered: true
    },

    // 垂直通道
    ch1: {
      enabled: true,
      voltIdx: 6,      // 默认 1.00 V/div
      pos: -1.5,       // 垂直零点位置 (单位: div, -4 ~ +4)
      coupling: 'DC',  // 'DC' | 'AC' | 'GND'
      bwLimit: false,
      probe: 1,        // 1 | 10
      invert: false,
      rotationDeg: 0
    },
    ch2: {
      enabled: false,
      voltIdx: 6,      // 默认 1.00 V/div
      pos: 1.5,        // 垂直零点位置 (单位: div)
      coupling: 'DC',
      bwLimit: false,
      probe: 1,
      invert: false,
      rotationDeg: 0
    },

    // 数学运算通道
    math: {
      mode: 'OFF' // 'OFF' | 'CH1+CH2' | 'CH1-CH2'
    },

    // 光标位置 (以屏幕格数 div 为单位，中心为 0,0)
    cursors: {
      x1: -2.0,
      x2: 2.0,
      y1: 1.5,
      y2: -1.5,
      dragging: null
    },

    // 被测信号源 (Signal Generator)
    sig1: {
      wave: 'square',
      freq: 1000,
      amp: 3.3,
      offset: 1.65
    },
    sig2: {
      wave: 'sine',
      freq: 1000,
      amp: 2.0,
      offset: 0.0,
      phase: 90
    },

    // 旋钮视觉旋转角度缓存
    knobAngles: {
      timebase: 0,
      hpos: 0,
      triglevel: 0,
      ch1scale: 0,
      ch1pos: 0,
      ch2scale: 0,
      ch2pos: 0
    },

    // 失步滚动相位与冻结帧缓冲
    freeRunPhase: 0,
    frozenFrame: null,

    // 交互教学课程进度
    currentLessonIdx: 0,
    completedLessons: new Set()
  };

  // ==================== 3. 全按键与旋钮中英文百科数据库 ====================
  const CONTROL_DOCS = {
    btn_auto: {
      zone: 'SYSTEM · 系统控制',
      zh: '自动设置 (Auto Scale / Auto Set)',
      en: 'Auto Scale / Auto Set',
      desc: '示波器最常用的“救急键”。按下后示波器会自动检测当前通道输入的信号频率和幅值，自动配置最佳的【伏/格 Volts/Div】、【秒/格 Sec/Div】以及【触发电平 Trigger Level】，让屏幕上稳定显示 2~4 个完整周期的波形。',
      tip: '新手口诀：接好探头看不见波形时，先按 Auto Scale！但要注意：对于极低频、偶发毛刺或直流电源纹波，Auto Scale 可能会误判，此时仍需手动微调。'
    },
    btn_runstop: {
      zone: 'SYSTEM · 运行控制',
      zh: '运行 / 停止采集 (Run / Stop)',
      en: 'Run / Stop Acquisition',
      desc: '控制示波器是否持续采集新波形。亮绿灯（RUN）表示实时刷新波形；按下变红灯（STOP）表示冻结当前屏幕上的波形，方便你仔细观察细节或用光标测量。',
      tip: '当你想抓拍某个瞬态波形或放大观察波形细节时，随时按 Run/Stop 冻结屏幕。'
    },
    btn_single: {
      zone: 'SYSTEM · 运行控制',
      zh: '单次触发捕获 (Single Sweep)',
      en: 'Single Sequence Capture',
      desc: '专门用于捕捉“一闪而过”的非周期信号（如按键抖动、上电浪涌、偶发故障脉冲）。按下后示波器进入预备等待状态（WAIT），一旦信号跨过触发电平，立即抓拍一屏波形并自动停止（STOP）。',
      tip: '使用步骤：① 先调好触发电平 Level → ② 按下 Single 进入等待 → ③ 触发一次电路事件，波形即被定格！'
    },
    btn_default: {
      zone: 'SYSTEM · 系统控制',
      zh: '恢复出厂默认设置 (Default Setup)',
      en: 'Default Setup',
      desc: '将所有被调乱的垂直挡位、水平时基、触发模式、耦合方式和数学运算一键恢复到标准初始状态（CH1 开启、1V/div、200μs/div、DC 耦合、自动边沿触发）。',
      tip: '在实验室里接手别人刚用过的示波器时，建议先按一次 Default，避免前人留下的 10X 探头比、带宽限制或反相设置误导你的测量。'
    },
    btn_measure: {
      zone: 'MEASURE · 测量系统',
      zh: '自动参数测量 (Measure)',
      en: 'Automatic Measurements',
      desc: '开关屏幕底部的自动测量统计栏，实时自动计算并显示信号的峰峰值（Vpp）、最大值（Vmax）、最小值（Vmin）、平均值（Vavg）、频率（Freq）、周期（Period）和占空比（Duty）。',
      tip: '自动测量基于当前屏幕采集到的数据点。如果屏幕上连 1 个完整周期都不到，频率（Freq）测量就会显示 "---" 无法计算！'
    },
    btn_cursor: {
      zone: 'MEASURE · 测量系统',
      zh: '光标手动测量 (Cursors)',
      en: 'Manual Cursor Measurement',
      desc: '在屏幕上开启两根水平电压光标（AY, BY）和两根垂直时间光标（AX, BX）。你可以直接用鼠标拖动屏幕上的虚线光标，精准测量任意两点之间的时间差 ΔT、等效频率 1/ΔT 和电压差 ΔV。',
      tip: '自动测量只能测整段波形，而光标测量可以精确卡住脉冲的上升时间、两个波峰之间的相位延迟或任意局部台阶电压。'
    },
    btn_persist: {
      zone: 'ACQUIRE · 采集与显示',
      zh: '数字荧光余晖 (Persistence)',
      en: 'Waveform Persistence',
      desc: '开启后，历史波形不会立刻消失，而是在屏幕上保留多层渐隐残影（类似老式模拟 CRT 示波器的荧光余晖）。非常适合观察信号抖动（Jitter）、偶发毛刺或调幅包络。',
      tip: '排查信号偶发跳变或噪声包络时打开余晖，异常轨迹会清晰叠加在屏幕上。'
    },
    btn_xy: {
      zone: 'DISPLAY · 显示模式',
      zh: 'X-Y 模式 / 李萨如图形 (X-Y Mode)',
      en: 'X-Y Display Mode (Lissajous)',
      desc: '关闭水平时间轴，改用 CH1 的电压作为水平 X 轴、CH2 的电压作为垂直 Y 轴绘制轨迹（即著名的“李萨如图形 Lissajous Figure”），常用于直观测量两个同频信号的相位差或频率整数比。',
      tip: '点击顶部信号源的【双通道相位差(X-Y)】预设，再开启 X-Y 模式：当两路同频正弦波相差 90° 时，屏幕会呈现一个标准圆或正椭圆！'
    },
    knob_sec_div: {
      zone: 'HORIZONTAL · 水平控制',
      zh: '水平时基旋钮：秒/格 (Sec/Div)',
      en: 'Horizontal Scale (Seconds / Division)',
      desc: '控制屏幕水平方向每一大格（Division）代表的时间长度。顺时针旋转（数值变小，如 50μs/div）会把波形在水平方向“拉开”，看清一个周期的微观细节；逆时针旋转（数值变大，如 5ms/div）会把波形“压缩”，同时看到几十个周期的宏观趋势。',
      tip: '改变 Sec/Div 并不会改变真实信号的频率，只是改变了你观察时间的“放大倍率”。通常调到屏幕显示 2~3 个完整周期最合适。'
    },
    knob_h_pos: {
      zone: 'HORIZONTAL · 水平控制',
      zh: '水平触发位移旋钮 (Horizontal Position / Delay)',
      en: 'Horizontal Trigger Position',
      desc: '控制触发时刻（屏幕顶部的橙色倒三角 ▼）在水平轴上的左右位置。向右旋转可观察触发点之前的历史波形（预触发 Pre-trigger），向左旋转可观察触发点之后的延时波形。',
      tip: '双击该旋钮或点击下方【按压归零】按钮，即可把触发时间零点立刻复位到屏幕正中央。'
    },
    btn_hpos_zero: {
      zone: 'HORIZONTAL · 水平控制',
      zh: '水平位移按压归零 (Push to Zero)',
      en: 'Horizontal Position Reset to 0s',
      desc: '现代示波器的位移旋钮均带有按压微动开关，按一下即可将水平触发延时（Delay）立刻归零，让触发点回到屏幕水平中心线。',
      tip: '当波形被移出视野找不到时，按一下归零立即回到基准中心。'
    },
    knob_trig_level: {
      zone: 'TRIGGER · 触发控制',
      zh: '触发电平旋钮 (Trigger Level)',
      en: 'Trigger Voltage Level',
      desc: '决定信号电压达到多少伏特时示波器才开始同步画图（屏幕右侧带 T 的橙色水平虚线）。只有当触发电平线位于波形的最高点（Vmax）与最低点（Vmin）之间时，波形才能稳定“定住”不乱跑！',
      tip: '如果你发现波形在屏幕上左右乱滚（失步），90% 的原因都是触发电平超出了波形的幅值范围！把橙色虚线拧回波形内部即可瞬间锁定。'
    },
    btn_trig_50: {
      zone: 'TRIGGER · 触发控制',
      zh: '触发电平一键 50% (Push to 50%)',
      en: 'Set Trigger Level to 50%',
      desc: '真实示波器触发旋钮支持按下操作（或独立 50% 键）：自动测量当前触发源信号的最大值与最小值，并将触发电平精准设在波形垂直正中间（50% 幅值处）。',
      tip: '当波形乱滚失步时，按一下【按压 50%】就能瞬间锁住周期波形！'
    },
    btn_trig_mode: {
      zone: 'TRIGGER · 触发控制',
      zh: '触发方式切换 (Trigger Mode: Auto / Normal)',
      en: 'Trigger Sweep Mode (AUTO / NORMAL)',
      desc: '切换【AUTO 自动】与【NORMAL 普通】触发模式：\n• AUTO：即使没有达到触发条件，示波器也会强制定时刷新屏幕（此时波形会滚动），好处是测直流电平或触发设错时屏幕不会黑屏；\n• NORMAL：只有严格满足触发条件才刷新屏幕，否则等待（WAIT）并保持上一帧画面。',
      tip: '日常测量用 AUTO；抓低重复率的窄脉冲或偶发信号时必须切换到 NORMAL。'
    },
    btn_trig_slope: {
      zone: 'TRIGGER · 触发控制',
      zh: '触发边沿斜率 (Trigger Slope: Rising / Falling)',
      en: 'Edge Trigger Slope (Rising ↑ / Falling ↓)',
      desc: '选择是在信号电压从低往高爬升穿过触发电平时同步（↑ 上升沿触发 Rising Edge），还是从高往低跌落穿过触发电平时同步（↓ 下降沿触发 Falling Edge）。',
      tip: '切换上升沿/下降沿时，观察屏幕中心线（触发点）处的波形跳变方向会立刻翻转！'
    },
    btn_trig_src: {
      zone: 'TRIGGER · 触发控制',
      zh: '触发源选择 (Trigger Source)',
      en: 'Trigger Source Channel (CH1 / CH2)',
      desc: '选择以哪个通道的信号作为同步基准（CH1 或 CH2）。当同时观测两路有因果关系的信号时，应选择最稳定或作为主时钟的那一路作为触发源。',
      tip: '注意：如果当前只开启了 CH1，却把触发源设成了 CH2，可能会因为触发源无有效信号或不同步而导致 CH1 波形滚动！'
    },
    btn_trig_force: {
      zone: 'TRIGGER · 触发控制',
      zh: '强制触发 (Force Trigger)',
      en: 'Force Trigger Acquisition',
      desc: '在 NORMAL（普通）或 SINGLE（单次）触发模式下，如果一直等不到触发条件处于 WAIT 状态，按一下 Force 即可无视触发条件强制采集并刷新一帧当前屏幕波形。',
      tip: '用于确认当前未触发状态下输入端到底处于什么直流电平。'
    },
    knob_ch1_scale: {
      zone: 'VERTICAL · 垂直控制 (CH1)',
      zh: 'CH1 垂直灵敏度旋钮：伏/格 (Volts/Div)',
      en: 'CH1 Vertical Scale (Volts / Division)',
      desc: '调节通道 1 在屏幕垂直方向每一大格（Division）代表的电压大小（从 10mV/div 到 10V/div 按 1-2-5 规律步进）。顺时针旋转放大波形，逆时针旋转缩小波形。',
      tip: '如何人工读电压？看波形从波谷到波峰占了几大格，乘以左下角显示的 V/div 数值即可。例如占 3.3 格 × 1V/div = 3.3Vpp。'
    },
    knob_ch1_pos: {
      zone: 'VERTICAL · 垂直控制 (CH1)',
      zh: 'CH1 垂直位移旋钮 (Vertical Position 1)',
      en: 'CH1 Vertical Offset / Position',
      desc: '上下移动通道 1 波形在屏幕上的显示基线位置（注意观察屏幕左边缘带有“1⏚”字样的黄色零电平箭头会同步上下移动）。',
      tip: '双通道同时观测时，通常会把 CH1 的基线往上挪、CH2 的基线往下挪，让两条波形上下分开互不重叠，方便对比时序。'
    },
    btn_ch1_zero: {
      zone: 'VERTICAL · 垂直控制 (CH1)',
      zh: 'CH1 垂直位移归零 (Position Zero)',
      en: 'Reset CH1 Vertical Position to Center',
      desc: '将通道 1 的 0V 基准线（左边缘黄色箭头）立即移回屏幕垂直正中心。',
      tip: '当波形被拧到屏幕外看不见时，按一下归零即可找回基准线。'
    },
    btn_ch1: {
      zone: 'VERTICAL · 垂直控制 (CH1)',
      zh: '通道 1 开关与软键菜单 (CH1 On/Off & Menu)',
      en: 'Channel 1 Toggle & SoftMenu',
      desc: '点击可开启/关闭通道 1 波形显示，同时将屏幕右侧的软键菜单切换到 CH1 设置（可配置 DC/AC/GND 耦合、带宽限制、1X/10X 探头比、波形反相）。',
      tip: '真实示波器上：通道未点亮时按一下是开启通道并唤出菜单；已点亮且菜单在当前通道时再按一下则是关闭该通道。'
    },
    knob_ch2_scale: {
      zone: 'VERTICAL · 垂直控制 (CH2)',
      zh: 'CH2 垂直灵敏度旋钮：伏/格 (Volts/Div)',
      en: 'CH2 Vertical Scale (Volts / Division)',
      desc: '独立调节通道 2（青色波形）在屏幕垂直方向每一大格代表的电压值。CH1 和 CH2 可以设置完全不同的电压挡位（例如 CH1 看 5V 数字逻辑，CH2 用 50mV 看微弱模拟传感器信号）。',
      tip: '读取 CH2 波形幅值时，一定要看屏幕底部青色标签【2】对应的 V/div 挡位，不要误看成 CH1 的挡位！'
    },
    knob_ch2_pos: {
      zone: 'VERTICAL · 垂直控制 (CH2)',
      zh: 'CH2 垂直位移旋钮 (Vertical Position 2)',
      en: 'CH2 Vertical Offset / Position',
      desc: '上下移动通道 2（青色波形）在屏幕上的 0V 基准线位置（屏幕左边缘青色“2⏚”标识同步移动）。',
      tip: '点击下方的【归零】小按钮可将 CH2 的 0V 基线立刻复位到屏幕垂直正中央。'
    },
    btn_ch2_zero: {
      zone: 'VERTICAL · 垂直控制 (CH2)',
      zh: 'CH2 垂直位移归零 (Position Zero)',
      en: 'Reset CH2 Vertical Position to Center',
      desc: '将通道 2 的 0V 基准线立即复位到屏幕垂直中心线。',
      tip: '在对比 CH1 与 CH2 绝对电压高低时，可将两个通道都按归零使它们共用同一条 0V 中心线。'
    },
    btn_ch2: {
      zone: 'VERTICAL · 垂直控制 (CH2)',
      zh: '通道 2 开关与软键菜单 (CH2 On/Off & Menu)',
      en: 'Channel 2 Toggle & SoftMenu',
      desc: '开启或关闭通道 2（青色波形），并将屏幕右侧软键菜单切换至 CH2。',
      tip: '开启 CH2 后，你可以对比观测两路信号的幅值、相位差，或者开启 MATH 运算与 X-Y 李萨如模式。'
    },
    btn_math: {
      zone: 'VERTICAL · 数学运算',
      zh: '数学运算通道 (Math: CH1+CH2 / CH1-CH2)',
      en: 'Waveform Math Operations',
      desc: '开启紫红色的数学运算波形（M），对 CH1 与 CH2 实时进行【CH1 + CH2 叠加】或【CH1 - CH2 差分相减】运算。',
      tip: 'CH1 - CH2（差分测量）在没有高压差分探头时非常实用：用两根普通探头分别测电阻两端对地电压，再开启 CH1-CH2 即可直接得出电阻上的压降波形！'
    },
    btn_ch1_coupling: {
      zone: 'VERTICAL · 通道耦合',
      zh: 'CH1 输入耦合方式 (Coupling: DC / AC / GND)',
      en: 'CH1 Input Coupling (DC / AC / GND)',
      desc: '决定信号如何进入示波器放大器：\n• DC（直流耦合）：直流分量和交流分量全部通过，显示信号真实绝对电压；\n• AC（交流耦合）：内部串联隔直电容，滤除直流偏置，只看交流变化（专门用于放大观察直流电源上的微小纹波！）；\n• GND（接地）：断开输入并将放大器输入接地，用于确认 0V 基准线在哪里。',
      tip: '实验推荐：点击顶部【5V电源+纹波】预设，在 DC 耦合下纹波小得看不清；切换到 AC 耦合再把 Volts/Div 拧到 50mV/div，微小的电源纹波立刻清晰呈现！'
    },
    btn_ch2_coupling: {
      zone: 'VERTICAL · 通道耦合',
      zh: 'CH2 输入耦合方式 (Coupling: DC / AC / GND)',
      en: 'CH2 Input Coupling (DC / AC / GND)',
      desc: '切换通道 2 的输入耦合模式：DC（直通）、AC（隔直看交流）、GND（内部接地校准零点）。',
      tip: 'AC 耦合相当于在探头后串了一个高通滤波器（通常截止频率约 10Hz），因此测低频信号时注意相移。'
    },
    softkey_f1: {
      zone: 'SOFTKEY · 屏幕右侧菜单键 F1',
      zh: '菜单软键 F1：输入耦合 (Coupling: DC / AC / GND)',
      en: 'Softkey F1: Input Coupling',
      desc: '对应屏幕右侧菜单第 1 项：循环切换当前选中通道（CH1 或 CH2）的输入耦合方式（DC 直流耦合 / AC 交流隔直耦合 / GND 接地基准）。',
      tip: '测量 5V 或 12V 直流电源上的毫伏级纹波时，必须切换到 AC 耦合，否则一旦调小 Volts/Div 波形就会飞出屏幕顶部！'
    },
    softkey_f2: {
      zone: 'SOFTKEY · 屏幕右侧菜单键 F2',
      zh: '菜单软键 F2：20MHz 带宽限制 (BW Limit)',
      en: 'Softkey F2: 20MHz Bandwidth Limit',
      desc: '对应屏幕右侧菜单第 2 项：开启或关闭 20MHz 硬件低通滤波器。开启后会在屏幕底部通道栏显示 "B" 标志，滤除高频环境底噪，让中低频波形变得干净平滑。',
      tip: '在开关电源或电机驱动等强高频干扰环境下测几十 kHz 的信号时，打开 BW Limit 可以让毛刺噪声大幅降低。'
    },
    softkey_f3: {
      zone: 'SOFTKEY · 屏幕右侧菜单键 F3',
      zh: '菜单软键 F3：探头衰减比 (Probe Ratio: 1X / 10X)',
      en: 'Softkey F3: Probe Attenuation Ratio (1X / 10X)',
      desc: '对应屏幕右侧菜单第 3 项：切换示波器读数乘数（1X 或 10X），必须与你手里物理探头手柄上的拨动开关（1X / 10X）保持一致！',
      tip: '最常见新手错误：探头手柄拨在 10X（信号被衰减了 10 倍），而示波器菜单里还是 1X，导致测出来的 3.3V 电压显示成了 0.33V，相差整整 10 倍！'
    },
    softkey_f4: {
      zone: 'SOFTKEY · 屏幕右侧菜单键 F4',
      zh: '菜单软键 F4：波形反相 (Invert)',
      en: 'Softkey F4: Waveform Invert',
      desc: '对应屏幕右侧菜单第 4 项：将当前通道的波形围绕其 0V 基准线做 180° 上下镜像翻转（正电压变负电压）。',
      tip: '查看反相放大器输出或低电平有效的逻辑信号时，开启 Invert 可以直观对比输入与输出波形形状。'
    },
    softkey_f5: {
      zone: 'SOFTKEY · 屏幕右侧菜单键 F5',
      zh: '菜单软键 F5：测量单位 (Unit: V / A)',
      en: 'Softkey F5: Channel Measurement Unit (V / A)',
      desc: '切换当前通道的物理量纲：使用普通电压探头时选 V（伏特），使用电流钳探头时选 A（安培）。',
      tip: '本教学台默认采用标准电压探头（V）。'
    },
    bnc_cal: {
      zone: 'HARDWARE · 探头补偿校准端',
      zh: '探头补偿标准源 (Probe Comp: ~3.3Vpp 1kHz 方波)',
      en: 'Probe Compensation Output (1kHz Square Wave)',
      desc: '几乎所有示波器右下角都有这两个金属挂耳：上方钩子输出精准的 1kHz、约 3V~3.3V 峰峰值标准方波，下方为地线（GND）。点击即可将 CH1 接回标准校准方波。',
      tip: '每次使用示波器前，先把探头钩在 Probe Comp 上按 Auto Scale：如果方波顶部是平的，说明探头电容补偿正常；若方波有尖峰（过冲）或圆角（欠补偿），需用无感螺丝刀调节探头上的微调电容孔。'
    },
    bnc_ch1: {
      zone: 'HARDWARE · BNC 同轴接口',
      zh: 'CH1 BNC 探头输入接口 (1MΩ // 15pF)',
      en: 'CH1 BNC Coaxial Input Connector',
      desc: '通道 1 的物理 BNC 同轴接口，标准输入阻抗为 1MΩ 并联约 15pF 电容。点击此接口可快速切换 CH1 开关。',
      tip: '注意接口旁标注的 "300Vrms CAT I" 安全耐压上限，外圈金属壳与示波器电源插头的安全地（大地）直接连通，严禁把探头地线夹子夹在非隔离市电火线上！'
    },
    bnc_ch2: {
      zone: 'HARDWARE · BNC 同轴接口',
      zh: 'CH2 BNC 探头输入接口 (1MΩ // 15pF)',
      en: 'CH2 BNC Coaxial Input Connector',
      desc: '通道 2 的物理 BNC 同轴接口。点击此接口可快速开启或关闭 CH2 通道。',
      tip: '重要安全铁律：CH1 和 CH2 的 BNC 外壳（探头黑色鳄鱼夹地线）在示波器内部是连通在一起的！双通道同时测量时，两根探头的地线夹必须夹在同一个参考地上，否则会造成短路炸机！'
    }
  };

  // ==================== 4. 6步交互式实操教学课程 ====================
  const LESSONS = [
    {
      id: 1,
      tag: '第 1 课 · 上手第一步',
      title: '1. 探头自检与一键自动设置 (Auto Scale)',
      goal: '学会拿到示波器后的标准开机自检流程：接入 1kHz 校准方波，并用 Auto Scale 一键捕获稳定波形。',
      task: '请点击示波器控制面板左上角的蓝色【自动设置 / Auto Scale】按钮（或先点击右下角 PROBE COMP 校准端再按 Auto Scale）。',
      principle: '任何示波器右下角都自带一个 1kHz、约 3.3Vpp 的标准方波测试钩（PROBE COMP）。按下 Auto Scale 后，示波器会自动识别信号频率与幅值，自动配好伏/格、秒/格和触发电平。',
      targetCtrl: 'btn_auto',
      check: (st, lastAction) => lastAction === 'auto_scale'
    },
    {
      id: 2,
      tag: '第 2 课 · 垂直系统 (看电压)',
      title: '2. 调节“伏/格 (Volts/Div)”放大波形',
      goal: '理解垂直灵敏度旋钮的作用：改变屏幕垂直方向每一格代表的电压，使波形占满屏幕高度的 60% 以上以减小读数误差。',
      task: '请用鼠标滚轮或上下拖拽 CH1 的【伏/格 (Volts/Div)】大旋钮，将 CH1 垂直挡位调节到【500 mV/div】或【2.00 V/div】体验波形缩放，最后调回【1.00 V/div】。',
      principle: '屏幕垂直共 8 大格。当 CH1 为 1.00V/div 时，3.3V 的方波正好占据 3.3 大格高。牢记公式：信号电压峰峰值 Vpp = 波形垂直占格数 × 当前 V/div 挡位。',
      targetCtrl: 'knob_ch1_scale',
      check: (st, lastAction) => lastAction === 'ch1_scale_changed'
    },
    {
      id: 3,
      tag: '第 3 课 · 水平系统 (看时间/频率)',
      title: '3. 调节“秒/格 (Sec/Div)”拉伸或压缩时间轴',
      goal: '掌握水平时基旋钮的用法：观察单个脉冲细节时缩小秒/格，观察多个周期整体趋势时增大秒/格。',
      task: '请旋转水平控制区的【秒/格 (Sec/Div)】大旋钮，将水平时基调节到【500 μs/div】或【1.00 ms/div】，让屏幕上显示 5 个以上完整方波周期。',
      principle: '1kHz 方波的周期 T = 1 / 1000Hz = 1ms (1000μs)。当水平时基设为 500μs/div 时，每一个完整周期在水平方向正好占据 2 大格！',
      targetCtrl: 'knob_sec_div',
      check: (st) => TIME_STEPS[st.timeIdx] >= 0.0005
    },
    {
      id: 4,
      tag: '第 4 课 · 触发系统 (为什么波形会乱跑？)',
      title: '4. 触发电平 (Trigger Level) 与边沿锁定',
      goal: '攻克新手最大难点——“触发”：亲手体验触发电平移出波形范围导致波形失步乱滚，并重新锁定它，再切换下降沿触发。',
      task: '① 转动触发区的【触发电平 Level】旋钮（或按【按压 50%】）使触发状态稳定；② 点击【触发边沿 Slope】按钮切换到【↓ Falling 下降沿触发】，观察屏幕中心触发点波形的变化！',
      principle: '示波器每秒刷新成千上万帧波形，如果不约定“每次都在电压跨过多少伏、且正在上升还是下降那一刻开始画”，前后帧就会错位重影。触发就是给所有帧拍合照时的“对齐口令”！',
      targetCtrl: 'btn_trig_slope',
      check: (st) => st.trig.slope === 'FALLING' && st.trig.isTriggered
    },
    {
      id: 5,
      tag: '第 5 课 · 进阶实战 (AC耦合测电源纹波)',
      title: '5. 用 AC 交流耦合测量 5V 电源上的微弱纹波',
      goal: '学会工程中最实用的电源纹波测试技巧：用 AC 耦合滤掉 5V 直流分量，再用高灵敏度挡位放大毫伏级交流纹波。',
      task: '① 点击页面顶部信号源的【5V电源+纹波(测AC耦合)】预设；② 点击面板上的【CH1 耦合】（或右侧软键 F1）切换为【AC】；③ 将 CH1 的【伏/格 Volts/Div】旋钮放大到【100 mV/div】或【50 mV/div】！',
      principle: '5V 直流电源上叠加了 150mV 的交流纹波。如果用 DC 耦合直接调到 100mV/div，5V 直流相当于 50 格高，波形直接飞出屏幕顶外！切到 AC 耦合后，5V 直流被隔直电容挡住，只剩 150mV 纹波留在屏幕中央供你放大观察。',
      targetCtrl: 'btn_ch1_coupling',
      check: (st) => st.sig1.wave === 'dc_ripple' && st.ch1.coupling === 'AC' && VOLT_STEPS[st.ch1.voltIdx] <= 0.1
    },
    {
      id: 6,
      tag: '第 6 课 · 双通道对比、光标与 X-Y 模式',
      title: '6. 开启双通道 CH2、光标测量或 X-Y 李萨如图形',
      goal: '掌握双通道协同工作、手动拖动屏幕光标精准读数，以及 X-Y 相位差图形观测。',
      task: '请点击【CH 2】按钮开启通道 2，并开启【光标测量 Cursors】（在屏幕上拖动虚线光标读数）或开启【X-Y 模式】观察李萨如椭圆！',
      principle: '开启 CH2 后你可以同时比对两路信号的延时与相位；开启 Cursors 可以用鼠标直接拖拽 AX/BX/AY/BY 四条标线读取任意两点的 ΔT 和 ΔV。',
      targetCtrl: 'btn_ch2',
      check: (st) => st.ch2.enabled && (st.showCursors || st.xyMode)
    }
  ];

  // ==================== 5. UI 静态文本双语字典 ====================
  const UI_I18N = {
    zh: {
      appTitle: '数字示波器交互实训台',
      appSubtitle: '100 MHz · 1 GSa/s · 双通道数字荧光教学系统',
      sigGenTitle: '被测信号源 (Signal Input)',
      presetCal: '1kHz 校准方波',
      presetSine: '工频/音频正弦',
      presetRipple: '5V电源+纹波(测AC耦合)',
      presetXY: '双通道相位差(X-Y)',
      presetPulse: '脉冲序列(测触发)',
      lblFreq: '频率',
      lblAmp: '峰峰值',
      lblOffset: '直流偏置',
      lblPhase: '相位差',
      softCoupling: '耦合',
      softBWLimit: '带宽限制',
      softProbe: '探头比',
      softInvert: '反相',
      softUnit: '单位',
      cursorBoxTitle: '光标测量 (Cursors)',
      cursorDragHint: '提示：可直接在屏幕上拖动虚线光标',
      knobOpHint: '滚轮/上下拖拽调节旋钮 · 双击归零',
      inspectorTag: '按键/旋钮实时解析',
      inspWhatTitle: '核心作用',
      inspTipTitle: '实战技巧 & 常见误区',
      tabLessons: '6步交互实操课',
      tabGlossary: '全部按键速查词典',
      lblActionTask: '实操任务：',
      lblPrinciple: '原理解析：',
      btnShowWhere: '闪烁提示目标按钮',
      btnNextLesson: '下一课 →'
    },
    en: {
      appTitle: 'Interactive Digital Oscilloscope Trainer',
      appSubtitle: '100 MHz · 1 GSa/s · 2-Ch Digital Storage Oscilloscope Simulator',
      sigGenTitle: 'DUT Signal Generator',
      presetCal: '1kHz Probe Comp',
      presetSine: '1kHz Sine Wave',
      presetRipple: '5V DC + Ripple (AC Test)',
      presetXY: 'Dual-Ch Phase (X-Y)',
      presetPulse: 'Pulse Train (Trigger)',
      lblFreq: 'Freq',
      lblAmp: 'Ampl',
      lblOffset: 'Offset',
      lblPhase: 'Phase',
      softCoupling: 'Coupling',
      softBWLimit: 'BW Limit',
      softProbe: 'Probe',
      softInvert: 'Invert',
      softUnit: 'Unit',
      cursorBoxTitle: 'Cursor Readout',
      cursorDragHint: 'Tip: Drag dashed cursor lines on screen',
      knobOpHint: 'Scroll / Drag to turn knobs · Double-click to reset',
      inspectorTag: 'Control Inspector',
      inspWhatTitle: 'Function & Purpose',
      inspTipTitle: 'Pro Tips & Common Mistakes',
      tabLessons: '6-Step Guided Labs',
      tabGlossary: 'All Controls Glossary',
      lblActionTask: 'Hands-on Task:',
      lblPrinciple: 'How It Works:',
      btnShowWhere: 'Highlight Target Control',
      btnNextLesson: 'Next Lab →'
    }
  };

  // ==================== 6. 工具格式化函数 ====================
  function formatVoltage(v, precision = 2) {
    const absV = Math.abs(v);
    if (absV < 1.0 && absV > 0) {
      return `${(v * 1000).toFixed(0)} mV`;
    }
    return `${v.toFixed(precision)} V`;
  }

  function formatVoltScale(vPerDiv, probe = 1) {
    const eff = vPerDiv * probe;
    if (eff < 1.0) {
      return `${(eff * 1000).toFixed(0)} mV`;
    }
    return `${eff.toFixed(2)} V`;
  }

  function formatTime(sec) {
    const absS = Math.abs(sec);
    if (absS === 0) return '0.00 s';
    if (absS < 1e-3) {
      return `${(sec * 1e6).toFixed(absS < 1e-4 ? 1 : 0)} μs`;
    }
    if (absS < 1.0) {
      return `${(sec * 1e3).toFixed(2)} ms`;
    }
    return `${sec.toFixed(2)} s`;
  }

  function formatFreq(hz) {
    if (!Number.isFinite(hz) || hz <= 0) return '---';
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
    return `${hz.toFixed(1)} Hz`;
  }

  // ==================== 7. 物理信号发生与耦合采样引擎 ====================
  /**
   * 计算某时刻 t (秒) 通道的输入电压 (经耦合、探头、带宽限制、反相处理后)
   */
  function sampleChannelVoltage(chKey, t, includeNoise = true) {
    const ch = state[chKey];
    const sig = chKey === 'ch1' ? state.sig1 : state.sig2;

    if (ch.coupling === 'GND') {
      return 0;
    }

    const freq = Math.max(1, Number(sig.freq) || 1000);
    const amp = Math.max(0.01, Number(sig.amp) || 1.0);
    const halfAmp = amp / 2;
    const offset = chKey === 'ch1' ? (Number(sig.offset) || 0) : 0;
    const phaseRad = chKey === 'ch2' ? ((Number(sig.phase) || 0) * Math.PI) / 180 : 0;

    const omega = 2 * Math.PI * freq;
    const theta = omega * t + phaseRad;
    // 归一化周期进度 [0, 1)
    const cyc = (((t * freq + phaseRad / (2 * Math.PI)) % 1) + 1) % 1;

    let acVal = 0;
    let dcComponent = offset;

    switch (sig.wave) {
      case 'sine':
        acVal = halfAmp * Math.sin(theta);
        break;
      case 'square': {
        // 带微弱真实过渡沿的方波
        const edgeSharpness = ch.bwLimit ? 18 : 65;
        acVal = halfAmp * Math.tanh(edgeSharpness * Math.sin(theta));
        break;
      }
      case 'triangle':
        acVal = halfAmp * (1 - 4 * Math.abs(Math.round(cyc - 0.25) - (cyc - 0.25)));
        break;
      case 'sawtooth':
        acVal = halfAmp * (2 * cyc - 1);
        break;
      case 'dc_ripple': {
        // 5V 直流电源叠加开关纹波与高频毛刺
        dcComponent = 5.0;
        const rippleFundamental = 0.065 * Math.sin(theta);
        const rippleHarmonic = 0.025 * Math.sin(3 * theta + 0.6);
        const switchingSpike = ch.bwLimit ? 0 : 0.035 * Math.exp(-Math.pow((cyc - 0.5) * 45, 2)) * Math.sin(25 * theta);
        acVal = rippleFundamental + rippleHarmonic + switchingSpike;
        break;
      }
      case 'pulse': {
        // 占空比 15% 的窄脉冲序列
        const duty = 0.15;
        acVal = cyc < duty ? halfAmp : -halfAmp;
        break;
      }
      case 'am': {
        // 调幅波 (载波 freq, 包络 freq/8)
        const env = 0.6 + 0.4 * Math.sin((omega / 8) * t);
        acVal = halfAmp * env * Math.sin(theta);
        break;
      }
      case 'noisy_sine': {
        const hfNoise = ch.bwLimit
          ? 0.03 * halfAmp * Math.sin(11 * theta)
          : 0.22 * halfAmp * (Math.sin(19 * theta) * 0.6 + (Math.random() - 0.5) * 0.9);
        acVal = halfAmp * Math.sin(theta) + hfNoise;
        break;
      }
      default:
        acVal = halfAmp * Math.sin(theta);
    }

    // 细微真实底噪
    let microNoise = 0;
    if (includeNoise) {
      const noiseScale = ch.bwLimit ? 0.002 : 0.008;
      microNoise = (Math.random() - 0.5) * noiseScale * VOLT_STEPS[ch.voltIdx];
    }

    // AC 耦合滤除直流偏置分量，DC 耦合保留直流分量
    let totalV = ch.coupling === 'AC' ? (acVal + microNoise) : (dcComponent + acVal + microNoise);

    if (ch.invert) {
      totalV = -totalV;
    }

    return totalV;
  }

  /**
   * 边沿触发检波器：在搜索窗口内寻找满足上升沿/下降沿跨过 trig.level 的时间点 tTrig
   */
  function findTriggerTime(windowSpan) {
    const srcKey = state.trig.source === 'CH2' ? 'ch2' : 'ch1';
    const level = state.trig.level;
    const isRising = state.trig.slope === 'RISING';

    const sig = srcKey === 'ch1' ? state.sig1 : state.sig2;
    const period = 1 / Math.max(1, Number(sig.freq) || 1000);
    // 搜索范围为至少 2.5 个信号周期或屏幕窗口宽度
    const searchSpan = Math.max(period * 2.5, windowSpan);
    const steps = 600;
    const dt = searchSpan / steps;

    let prevV = sampleChannelVoltage(srcKey, -searchSpan / 2, false);
    for (let i = 1; i <= steps; i++) {
      const t = -searchSpan / 2 + i * dt;
      const curV = sampleChannelVoltage(srcKey, t, false);

      if (isRising && prevV < level && curV >= level) {
        // 线性插值获得亚采样级精确触发时刻
        const frac = (level - prevV) / (curV - prevV || 1e-9);
        return { triggered: true, tTrig: t - dt + frac * dt };
      }
      if (!isRising && prevV > level && curV <= level) {
        const frac = (prevV - level) / (prevV - curV || 1e-9);
        return { triggered: true, tTrig: t - dt + frac * dt };
      }
      prevV = curV;
    }

    return { triggered: false, tTrig: 0 };
  }

  // ==================== 8. 示波器屏幕 Canvas 渲染引擎 ====================
  const canvas = document.getElementById('scopeCanvas');
  const ctx = canvas.getContext('2d');
  const GRID_COLS = 10;
  const GRID_ROWS = 8;

  function renderScopeScreen() {
    const W = canvas.width;
    const H = canvas.height;
    const padL = 22;
    const padR = 22;
    const padT = 18;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const cellW = plotW / GRID_COLS;
    const cellH = plotH / GRID_ROWS;
    const centerX = padL + plotW / 2;
    const centerY = padT + plotH / 2;

    // 1. 背景或余晖擦除
    if (state.persist && state.running) {
      ctx.fillStyle = 'rgba(4, 8, 14, 0.18)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#04080e';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. 绘制 10x8 标准示波器网格与中心十字刻度线 (Graticule)
    drawGraticule(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY);

    // 3. X-Y 模式分支
    if (state.xyMode) {
      drawXYMode(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY);
      return;
    }

    // 4. Y-T 时域模式：计算触发与采样点
    const secPerDiv = TIME_STEPS[state.timeIdx];
    const windowSpan = secPerDiv * GRID_COLS;
    const hDelaySec = -state.hPos * secPerDiv; // 水平位移对应的时间偏移

    let frameData = state.frozenFrame;

    if (state.running || !frameData) {
      const trigResult = findTriggerTime(windowSpan);
      state.trig.isTriggered = trigResult.triggered;

      let refTime = trigResult.tTrig;
      if (!trigResult.triggered) {
        // 失步状态：AUTO 模式下自由滚动，NORMAL/SINGLE 模式下保持等待
        state.freeRunPhase += secPerDiv * 0.37;
        refTime = state.freeRunPhase;
      }

      // NORMAL 或 SINGLE 模式下如果未触发且已有上一帧，则不更新画面
      const shouldUpdateFrame =
        trigResult.triggered ||
        (state.trig.mode === 'AUTO' && !state.singleArmed);

      if (shouldUpdateFrame || !frameData) {
        const numSamples = 750;
        const ch1Pts = new Float32Array(numSamples);
        const ch2Pts = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
          const normX = i / (numSamples - 1) - 0.5; // [-0.5, 0.5]
          const tSample = refTime + hDelaySec + normX * windowSpan;
          ch1Pts[i] = sampleChannelVoltage('ch1', tSample, true);
          ch2Pts[i] = sampleChannelVoltage('ch2', tSample, true);
        }

        frameData = { ch1Pts, ch2Pts, numSamples };
        state.frozenFrame = frameData;

        // 若单次触发 Armed 且成功触发，立即锁存并转入 STOP
        if (state.singleArmed && trigResult.triggered) {
          state.singleArmed = false;
          state.running = false;
          updateAllUI();
        }
      }
    }

    // 5. 绘制水平触发位置标记 (顶部橙色倒三角) 与触发电平线
    drawTriggerMarkers(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY);

    // 6. 绘制通道 0V 基准箭头与波形轨迹
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    if (state.ch1.enabled && frameData) {
      const vScale1 = VOLT_STEPS[state.ch1.voltIdx];
      const baseY1 = centerY - state.ch1.pos * cellH;
      drawWaveformTrace(frameData.ch1Pts, padL, plotW, baseY1, cellH / vScale1, '#ffd426', 2.2);
    }

    if (state.ch2.enabled && frameData) {
      const vScale2 = VOLT_STEPS[state.ch2.voltIdx];
      const baseY2 = centerY - state.ch2.pos * cellH;
      drawWaveformTrace(frameData.ch2Pts, padL, plotW, baseY2, cellH / vScale2, '#00e5ff', 2.0);
    }

    // 7. 绘制 MATH 数学运算波形
    if (state.math.mode !== 'OFF' && frameData) {
      const vScaleM = VOLT_STEPS[state.ch1.voltIdx];
      const mathPts = new Float32Array(frameData.numSamples);
      for (let i = 0; i < frameData.numSamples; i++) {
        mathPts[i] =
          state.math.mode === 'CH1+CH2'
            ? frameData.ch1Pts[i] + frameData.ch2Pts[i]
            : frameData.ch1Pts[i] - frameData.ch2Pts[i];
      }
      drawWaveformTrace(mathPts, padL, plotW, centerY, cellH / vScaleM, '#d966ff', 1.9);
    }

    // 8. 绘制手动测量光标 (Cursors)
    if (state.showCursors) {
      drawCursors(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY);
    }

    ctx.restore();

    // 9. 绘制左右侧边框通道基线标识 (1⏚, 2⏚, T)
    drawEdgeIndicators(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY);
  }

  function drawGraticule(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY) {
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 145, 180, 0.2)';
    ctx.lineWidth = 1;

    // 外框与主网格线
    ctx.strokeRect(padL, padT, plotW, plotH);
    ctx.beginPath();
    for (let c = 1; c < GRID_COLS; c++) {
      const x = padL + c * cellW;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
    }
    for (let r = 1; r < GRID_ROWS; r++) {
      const y = padT + r * cellH;
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
    }
    ctx.stroke();

    // 中心十字坐标轴加亮 + 0.2 格次级细分刻度
    ctx.strokeStyle = 'rgba(145, 180, 215, 0.38)';
    ctx.beginPath();
    ctx.moveTo(centerX, padT);
    ctx.lineTo(centerX, padT + plotH);
    ctx.moveTo(padL, centerY);
    ctx.lineTo(padL + plotW, centerY);

    const subTicksX = GRID_COLS * 5;
    for (let i = 1; i < subTicksX; i++) {
      const x = padL + (plotW / subTicksX) * i;
      ctx.moveTo(x, centerY - 3);
      ctx.lineTo(x, centerY + 3);
    }
    const subTicksY = GRID_ROWS * 5;
    for (let j = 1; j < subTicksY; j++) {
      const y = padT + (plotH / subTicksY) * j;
      ctx.moveTo(centerX - 3, y);
      ctx.lineTo(centerX + 3, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWaveformTrace(pts, padL, plotW, baseY, pxPerVolt, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.beginPath();

    const len = pts.length;
    for (let i = 0; i < len; i++) {
      const x = padL + (i / (len - 1)) * plotW;
      const y = baseY - pts[i] * pxPerVolt;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTriggerMarkers(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY) {
    const srcCh = state.trig.source === 'CH2' ? state.ch2 : state.ch1;
    const vScale = VOLT_STEPS[srcCh.voltIdx];
    const baseY = centerY - srcCh.pos * cellH;
    const trigY = baseY - (state.trig.level / vScale) * cellH;
    const trigX = centerX + state.hPos * cellW;

    ctx.save();

    // 水平触发电平虚线
    if (trigY >= padT && trigY <= padT + plotH) {
      ctx.strokeStyle = 'rgba(255, 140, 36, 0.45)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, trigY);
      ctx.lineTo(padL + plotW, trigY);
      ctx.stroke();
    }

    // 垂直触发基准时刻虚线
    if (trigX >= padL && trigX <= padL + plotW) {
      ctx.strokeStyle = 'rgba(255, 140, 36, 0.25)';
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(trigX, padT);
      ctx.lineTo(trigX, padT + plotH);
      ctx.stroke();

      // 顶部橙色倒三角 T
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff8c24';
      ctx.beginPath();
      ctx.moveTo(trigX, padT + 9);
      ctx.lineTo(trigX - 6, padT);
      ctx.lineTo(trigX + 6, padT);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEdgeIndicators(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY) {
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    // CH1 左侧零电平标志
    if (state.ch1.enabled) {
      const y1 = Math.max(padT + 8, Math.min(padT + plotH - 8, centerY - state.ch1.pos * cellH));
      ctx.fillStyle = '#ffd426';
      ctx.beginPath();
      ctx.moveTo(2, y1 - 6);
      ctx.lineTo(15, y1 - 6);
      ctx.lineTo(21, y1);
      ctx.lineTo(15, y1 + 6);
      ctx.lineTo(2, y1 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText('1', 6, y1 + 0.5);
    }

    // CH2 左侧零电平标志
    if (state.ch2.enabled) {
      const y2 = Math.max(padT + 8, Math.min(padT + plotH - 8, centerY - state.ch2.pos * cellH));
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(2, y2 - 6);
      ctx.lineTo(15, y2 - 6);
      ctx.lineTo(21, y2);
      ctx.lineTo(15, y2 + 6);
      ctx.lineTo(2, y2 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText('2', 6, y2 + 0.5);
    }

    // 右侧触发电平标志 T
    const srcCh = state.trig.source === 'CH2' ? state.ch2 : state.ch1;
    const vScale = VOLT_STEPS[srcCh.voltIdx];
    const baseY = centerY - srcCh.pos * cellH;
    const trigY = Math.max(padT + 8, Math.min(padT + plotH - 8, baseY - (state.trig.level / vScale) * cellH));
    const rightEdge = padL + plotW;

    ctx.fillStyle = '#ff8c24';
    ctx.beginPath();
    ctx.moveTo(rightEdge + 1, trigY);
    ctx.lineTo(rightEdge + 7, trigY - 6);
    ctx.lineTo(rightEdge + 20, trigY - 6);
    ctx.lineTo(rightEdge + 20, trigY + 6);
    ctx.lineTo(rightEdge + 7, trigY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText('T', rightEdge + 9, trigY + 0.5);

    ctx.restore();
  }

  function drawXYMode(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY) {
    const vScale1 = VOLT_STEPS[state.ch1.voltIdx];
    const vScale2 = VOLT_STEPS[state.ch2.voltIdx];
    const freq = Math.max(10, Number(state.sig1.freq) || 1000);
    const span = 2 / freq;
    const steps = 600;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    ctx.strokeStyle = '#22e568';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#22e568';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * span;
      const vx = sampleChannelVoltage('ch1', t, true);
      const vy = sampleChannelVoltage('ch2', t, true);

      const x = centerX + (vx / vScale1) * cellW;
      const y = centerY - (vy / vScale2) * cellH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCursors(padL, padT, plotW, plotH, cellW, cellH, centerX, centerY) {
    const cx1 = centerX + state.cursors.x1 * cellW;
    const cx2 = centerX + state.cursors.x2 * cellW;
    const cy1 = centerY - state.cursors.y1 * cellH;
    const cy2 = centerY - state.cursors.y2 * cellH;

    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';

    // 时间光标 AX, BX
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cx1, padT);
    ctx.lineTo(cx1, padT + plotH);
    ctx.moveTo(cx2, padT);
    ctx.lineTo(cx2, padT + plotH);
    ctx.stroke();

    ctx.fillText('AX', cx1 + 4, padT + 14);
    ctx.fillText('BX', cx2 + 4, padT + 14);

    // 电压光标 AY, BY
    ctx.strokeStyle = '#a855f7';
    ctx.fillStyle = '#a855f7';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, cy1);
    ctx.lineTo(padL + plotW, cy1);
    ctx.moveTo(padL, cy2);
    ctx.lineTo(padL + plotW, cy2);
    ctx.stroke();

    ctx.fillText('AY', padL + plotW - 24, cy1 - 4);
    ctx.fillText('BY', padL + plotW - 24, cy2 - 4);
    ctx.restore();
  }

  // ==================== 9. 实时自动测量参数计算 ====================
  function computeMeasurements(chKey) {
    const ch = state[chKey];
    const sig = chKey === 'ch1' ? state.sig1 : state.sig2;
    const probe = ch.probe;

    if (ch.coupling === 'GND') {
      return {
        vpp: 0,
        vmax: 0,
        vmin: 0,
        vavg: 0,
        freq: 0,
        period: 0,
        duty: 50
      };
    }

    const freq = Number(sig.freq) || 1000;
    const period = 1 / freq;
    const N = 240;
    let vmax = -Infinity;
    let vmin = Infinity;
    let sum = 0;
    let highCount = 0;

    for (let i = 0; i < N; i++) {
      const t = (i / N) * period;
      const v = sampleChannelVoltage(chKey, t, false) * probe;
      if (v > vmax) vmax = v;
      if (v < vmin) vmin = v;
      sum += v;
    }

    const vmid = (vmax + vmin) / 2;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * period;
      const v = sampleChannelVoltage(chKey, t, false) * probe;
      if (v >= vmid) highCount++;
    }

    const screenSpan = TIME_STEPS[state.timeIdx] * GRID_COLS;
    // 如果当前屏幕总时间还不足半个周期，真实示波器无法测出频率
    const canMeasureFreq = screenSpan >= period * 0.75;

    return {
      vpp: vmax - vmin,
      vmax,
      vmin,
      vavg: sum / N,
      freq: canMeasureFreq ? freq : NaN,
      period: canMeasureFreq ? period : NaN,
      duty: (highCount / N) * 100
    };
  }

  // ==================== 10. 更新 OSD 与面板所有状态显示 ====================
  function updateAllUI(lastAction = '') {
    const secPerDiv = TIME_STEPS[state.timeIdx];

    // 1. 顶部 OSD 状态栏
    const osdRunEl = document.getElementById('osdRunState');
    if (!state.running) {
      osdRunEl.textContent = 'STOP';
      osdRunEl.className = 'osd-acq-status stop';
    } else if (state.singleArmed || (state.trig.mode === 'NORMAL' && !state.trig.isTriggered)) {
      osdRunEl.textContent = 'WAIT';
      osdRunEl.className = 'osd-acq-status wait';
    } else if (state.trig.isTriggered) {
      osdRunEl.textContent = "TRIG'D";
      osdRunEl.className = 'osd-acq-status run';
    } else {
      osdRunEl.textContent = 'AUTO';
      osdRunEl.className = 'osd-acq-status wait';
    }

    document.getElementById('osdTimebase').textContent = `H: ${formatTime(secPerDiv)}/div`;
    document.getElementById('osdHPos').textContent = `D: ${formatTime(-state.hPos * secPerDiv)}`;
    document.getElementById('valTimebase').textContent = `${formatTime(secPerDiv)}`;

    const trigSrcDot = document.getElementById('osdTrigSrcDot');
    trigSrcDot.textContent = state.trig.source === 'CH2' ? '2' : '1';
    trigSrcDot.className = `trig-src-dot ${state.trig.source === 'CH2' ? 'ch2' : 'ch1'}`;
    document.getElementById('osdTrigSlope').textContent = state.trig.slope === 'RISING' ? '↑' : '↓';

    const srcProbe = state.trig.source === 'CH2' ? state.ch2.probe : state.ch1.probe;
    document.getElementById('osdTrigLevel').textContent = formatVoltage(state.trig.level * srcProbe);
    document.getElementById('osdTrigMode').textContent = state.singleArmed ? 'SINGLE' : state.trig.mode;

    // 2. 触发区状态指示
    const trigLedBadge = document.getElementById('trigLedBadge');
    if (state.trig.isTriggered && state.running) {
      trigLedBadge.textContent = "TRIG'D";
      trigLedBadge.classList.remove('untriggered');
    } else {
      trigLedBadge.textContent = state.running ? 'UNTRIG' : 'HOLD';
      trigLedBadge.classList.add('untriggered');
    }

    document.getElementById('lblTrigModeState').textContent = state.trig.mode;
    document.getElementById('lblTrigSlopeState').textContent =
      state.trig.slope === 'RISING' ? '↑ Rising' : '↓ Falling';
    const srcLbl = document.getElementById('lblTrigSrcState');
    srcLbl.textContent = state.trig.source;
    srcLbl.className = `btn-sub-state ${state.trig.source === 'CH2' ? 'ch2-text' : 'ch1-text'}`;

    // 3. 运行/停止/单次等系统按键背光
    const btnRunStop = document.getElementById('btnRunStop');
    btnRunStop.classList.toggle('lit-green', state.running);
    btnRunStop.classList.toggle('lit-red', !state.running);

    document.getElementById('btnSingle').classList.toggle('active-amber', state.singleArmed);
    document.getElementById('btnMeasure').classList.toggle('active-amber', state.showMeasure);
    document.getElementById('btnCursor').classList.toggle('active-amber', state.showCursors);
    document.getElementById('btnAcquire').classList.toggle('active-amber', state.persist);
    document.getElementById('btnDisplayXY').classList.toggle('active-amber', state.xyMode);

    // 4. 垂直通道状态与底部栏
    const v1 = VOLT_STEPS[state.ch1.voltIdx];
    const v2 = VOLT_STEPS[state.ch2.voltIdx];
    document.getElementById('valCh1Scale').textContent = formatVoltScale(v1, state.ch1.probe);
    document.getElementById('valCh2Scale').textContent = formatVoltScale(v2, state.ch2.probe);

    document.getElementById('btnCh1Toggle').classList.toggle('ch1-lit', state.ch1.enabled);
    document.getElementById('btnCh2Toggle').classList.toggle('ch2-lit', state.ch2.enabled);
    document.getElementById('bncCh1').classList.toggle('active', state.ch1.enabled);
    document.getElementById('bncCh2').classList.toggle('active', state.ch2.enabled);

    document.getElementById('lblCh1CplBtn').textContent = state.ch1.coupling;
    document.getElementById('lblCh2CplBtn').textContent = state.ch2.coupling;

    const osdCh1 = document.getElementById('osdCh1Badge');
    osdCh1.classList.toggle('active', state.ch1.enabled);
    document.getElementById('osdCh1Scale').textContent =
      `${formatVoltScale(v1, state.ch1.probe)}/div${state.ch1.bwLimit ? ' B' : ''}${state.ch1.invert ? ' ↓' : ''}`;
    document.getElementById('osdCh1Cpl').textContent = state.ch1.coupling;
    document.getElementById('osdCh1Prb').textContent = `${state.ch1.probe}X`;
    document.getElementById('osdCh1Off').textContent = `${(state.ch1.pos * v1 * state.ch1.probe).toFixed(2)}V`;

    const osdCh2 = document.getElementById('osdCh2Badge');
    osdCh2.classList.toggle('active', state.ch2.enabled);
    document.getElementById('osdCh2Scale').textContent =
      `${formatVoltScale(v2, state.ch2.probe)}/div${state.ch2.bwLimit ? ' B' : ''}${state.ch2.invert ? ' ↓' : ''}`;
    document.getElementById('osdCh2Cpl').textContent = state.ch2.coupling;
    document.getElementById('osdCh2Prb').textContent = `${state.ch2.probe}X`;
    document.getElementById('osdCh2Off').textContent = `${(state.ch2.pos * v2 * state.ch2.probe).toFixed(2)}V`;

    // MATH 状态
    const osdMath = document.getElementById('osdMathBadge');
    osdMath.classList.toggle('active', state.math.mode !== 'OFF');
    document.getElementById('osdMathMode').textContent = state.math.mode;
    document.getElementById('lblMathState').textContent = state.math.mode;
    document.getElementById('btnMathToggle').classList.toggle('math-lit', state.math.mode !== 'OFF');

    // X-Y 模式标签
    document.getElementById('osdXYBadge').classList.toggle('hidden', !state.xyMode);

    // 5. 屏幕右侧 OSD 软键菜单同步
    const activeChKey = state.activeMenuChannel === 'CH2' ? 'ch2' : 'ch1';
    const activeCh = state[activeChKey];
    const menuTitleEl = document.getElementById('osdMenuTitle');
    menuTitleEl.textContent = state.activeMenuChannel;
    menuTitleEl.style.background = activeChKey === 'ch2' ? 'var(--ch2-color)' : 'var(--ch1-color)';

    document.getElementById('softVal0').textContent = activeCh.coupling;
    document.getElementById('softVal1').textContent = activeCh.bwLimit ? '20M' : 'OFF';
    document.getElementById('softVal2').textContent = `${activeCh.probe}X`;
    document.getElementById('softVal3').textContent = activeCh.invert ? 'ON' : 'OFF';

    // 6. 光标测量悬浮窗数值
    const cursorBox = document.getElementById('osdCursorBox');
    cursorBox.classList.toggle('hidden', !state.showCursors);
    if (state.showCursors) {
      const t1 = state.cursors.x1 * secPerDiv;
      const t2 = state.cursors.x2 * secPerDiv;
      const dt = Math.abs(t2 - t1);
      const vScaleCur = VOLT_STEPS[activeCh.voltIdx] * activeCh.probe;
      const vy1 = (state.cursors.y1 - activeCh.pos) * vScaleCur;
      const vy2 = (state.cursors.y2 - activeCh.pos) * vScaleCur;
      const dv = Math.abs(vy1 - vy2);

      document.getElementById('curValT1').textContent = formatTime(t1);
      document.getElementById('curValT2').textContent = formatTime(t2);
      document.getElementById('curValDT').textContent = formatTime(dt);
      document.getElementById('curValFreq').textContent = dt > 0 ? formatFreq(1 / dt) : '---';
      document.getElementById('curValY').textContent = `${formatVoltage(vy1)} / ${formatVoltage(vy2)}`;
      document.getElementById('curValDV').textContent = formatVoltage(dv);
    }

    // 7. 底部自动测量栏
    renderMeasurementStrip();

    // 8. 评估当前实操课任务是否达成
    evaluateLessonProgress(lastAction);
  }

  function renderMeasurementStrip() {
    const strip = document.getElementById('osdMeasStrip');
    if (!state.showMeasure) {
      strip.innerHTML = '<span style="color:#64748b;font-size:11px;font-family:var(--font-mono)">[Measure OFF · 点击面板“自动测量 / Measure”开启实时读数]</span>';
      return;
    }

    const items = [];
    if (state.ch1.enabled) {
      const m1 = computeMeasurements('ch1');
      items.push(
        `<div class="meas-pill ch1"><span>CH1 Vpp:</span><strong>${formatVoltage(m1.vpp)}</strong></div>`,
        `<div class="meas-pill ch1"><span>Vmax:</span><strong>${formatVoltage(m1.vmax)}</strong></div>`,
        `<div class="meas-pill ch1"><span>Vavg:</span><strong>${formatVoltage(m1.vavg)}</strong></div>`,
        `<div class="meas-pill ch1"><span>Freq:</span><strong>${formatFreq(m1.freq)}</strong></div>`,
        `<div class="meas-pill ch1"><span>T:</span><strong>${Number.isFinite(m1.period) ? formatTime(m1.period) : '---'}</strong></div>`,
        `<div class="meas-pill ch1"><span>Duty:</span><strong>${m1.duty.toFixed(1)}%</strong></div>`
      );
    }
    if (state.ch2.enabled) {
      const m2 = computeMeasurements('ch2');
      items.push(
        `<div class="meas-pill ch2"><span>CH2 Vpp:</span><strong>${formatVoltage(m2.vpp)}</strong></div>`,
        `<div class="meas-pill ch2"><span>Freq:</span><strong>${formatFreq(m2.freq)}</strong></div>`,
        `<div class="meas-pill ch2"><span>Phase:</span><strong>${state.sig2.phase}°</strong></div>`
      );
    }

    strip.innerHTML = items.join('');
  }

  // ==================== 11. 旋钮旋转动画与鼠标交互 ====================
  function rotateKnobVisual(knobId, deltaDeg) {
    state.knobAngles[knobId] = (state.knobAngles[knobId] || 0) + deltaDeg;
    const el = document.querySelector(`[data-knob="${knobId}"] .knob-cap`);
    if (el) {
      el.style.transform = `rotate(${state.knobAngles[knobId]}deg)`;
    }
  }

  function handleKnobStep(knobId, direction) {
    // direction: +1 (顺时针), -1 (逆时针)
    rotateKnobVisual(knobId, direction * 24);
    let actionTag = '';

    switch (knobId) {
      case 'timebase':
        // 顺时针旋转放大时间细节（Sec/Div 变小）
        state.timeIdx = Math.max(0, Math.min(TIME_STEPS.length - 1, state.timeIdx - direction));
        actionTag = 'timebase_changed';
        break;
      case 'hpos':
        state.hPos = Math.max(-4.5, Math.min(4.5, +(state.hPos + direction * 0.25).toFixed(2)));
        actionTag = 'hpos_changed';
        break;
      case 'triglevel': {
        const srcCh = state.trig.source === 'CH2' ? state.ch2 : state.ch1;
        const stepV = VOLT_STEPS[srcCh.voltIdx] * 0.15;
        state.trig.level = +(state.trig.level + direction * stepV).toFixed(3);
        actionTag = 'triglevel_changed';
        break;
      }
      case 'ch1scale':
        // 顺时针旋转放大波形（Volts/Div 挡位值变小）
        state.ch1.voltIdx = Math.max(0, Math.min(VOLT_STEPS.length - 1, state.ch1.voltIdx - direction));
        actionTag = 'ch1_scale_changed';
        break;
      case 'ch1pos':
        state.ch1.pos = Math.max(-3.8, Math.min(3.8, +(state.ch1.pos + direction * 0.25).toFixed(2)));
        actionTag = 'ch1_pos_changed';
        break;
      case 'ch2scale':
        state.ch2.voltIdx = Math.max(0, Math.min(VOLT_STEPS.length - 1, state.ch2.voltIdx - direction));
        actionTag = 'ch2_scale_changed';
        break;
      case 'ch2pos':
        state.ch2.pos = Math.max(-3.8, Math.min(3.8, +(state.ch2.pos + direction * 0.25).toFixed(2)));
        actionTag = 'ch2_pos_changed';
        break;
    }

    updateAllUI(actionTag);
  }

  function initRotaryKnobs() {
    const knobs = document.querySelectorAll('.rotary-knob');
    let activeDrag = null;

    knobs.forEach((knob) => {
      const knobId = knob.dataset.knob;

      // 滚轮调节
      knob.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        handleKnobStep(knobId, dir);
      }, { passive: false });

      // 鼠标拖拽调节
      knob.addEventListener('mousedown', (e) => {
        e.preventDefault();
        activeDrag = { knobId, startY: e.clientY, startX: e.clientX };
      });

      // 双击旋钮快速归零/复位
      knob.addEventListener('dblclick', () => {
        if (knobId === 'hpos') state.hPos = 0;
        if (knobId === 'ch1pos') state.ch1.pos = 0;
        if (knobId === 'ch2pos') state.ch2.pos = 0;
        if (knobId === 'triglevel') setTrigger50Percent();
        updateAllUI('knob_reset');
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!activeDrag) return;
      const dy = activeDrag.startY - e.clientY;
      const dx = e.clientX - activeDrag.startX;
      const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
      if (Math.abs(delta) >= 14) {
        const dir = delta > 0 ? 1 : -1;
        handleKnobStep(activeDrag.knobId, dir);
        activeDrag.startY = e.clientY;
        activeDrag.startX = e.clientX;
      }
    });

    window.addEventListener('mouseup', () => {
      activeDrag = null;
    });
  }

  // ==================== 12. 实体面板按键功能实现 ====================
  function runAutoScale() {
    state.running = true;
    state.singleArmed = false;
    state.xyMode = false;
    state.ch1.enabled = true;
    if (state.ch1.coupling === 'GND') state.ch1.coupling = 'DC';

    // 自动匹配 CH1 垂直挡位 (让峰峰值占据约 4 格)
    const targetVPerDiv1 = Math.max(0.02, state.sig1.amp / 4);
    let bestVIdx1 = 0;
    for (let i = 0; i < VOLT_STEPS.length; i++) {
      if (VOLT_STEPS[i] >= targetVPerDiv1) {
        bestVIdx1 = i;
        break;
      }
      bestVIdx1 = i;
    }
    state.ch1.voltIdx = bestVIdx1;

    // 自动匹配水平时基 (让屏幕显示约 2.5 ~ 3 个周期)
    const period = 1 / Math.max(10, Number(state.sig1.freq) || 1000);
    const targetSecPerDiv = (period * 2.5) / GRID_COLS;
    let bestTIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < TIME_STEPS.length; i++) {
      const diff = Math.abs(Math.log(TIME_STEPS[i]) - Math.log(targetSecPerDiv));
      if (diff < minDiff) {
        minDiff = diff;
        bestTIdx = i;
      }
    }
    state.timeIdx = bestTIdx;
    state.hPos = 0;

    // 垂直位置居中 & 触发电平 50%
    if (state.ch2.enabled) {
      state.ch1.pos = 1.5;
      state.ch2.pos = -1.5;
    } else {
      const dcOff = state.ch1.coupling === 'DC' ? (Number(state.sig1.offset) || 0) : 0;
      state.ch1.pos = -dcOff / VOLT_STEPS[state.ch1.voltIdx];
      state.ch1.pos = Math.max(-2.5, Math.min(2.5, state.ch1.pos));
    }

    setTrigger50Percent();
    updateAllUI('auto_scale');
  }

  function setTrigger50Percent() {
    const srcKey = state.trig.source === 'CH2' ? 'ch2' : 'ch1';
    const m = computeMeasurements(srcKey);
    const probe = state[srcKey].probe;
    state.trig.level = +(((m.vmax + m.vmin) / 2) / probe).toFixed(2);
  }

  function resetDefaultSetup() {
    state.running = true;
    state.singleArmed = false;
    state.persist = false;
    state.xyMode = false;
    state.showMeasure = true;
    state.showCursors = false;
    state.activeMenuChannel = 'CH1';
    state.timeIdx = 5; // 200 us/div
    state.hPos = 0;

    state.trig = {
      source: 'CH1',
      mode: 'AUTO',
      slope: 'RISING',
      level: 1.65,
      isTriggered: true
    };

    state.ch1 = {
      enabled: true,
      voltIdx: 6, // 1.00 V/div
      pos: -1.5,
      coupling: 'DC',
      bwLimit: false,
      probe: 1,
      invert: false
    };

    state.ch2 = {
      enabled: false,
      voltIdx: 6,
      pos: 1.5,
      coupling: 'DC',
      bwLimit: false,
      probe: 1,
      invert: false
    };

    state.math.mode = 'OFF';
    updateAllUI('default_setup');
  }

  function cycleCoupling(chKey) {
    const order = ['DC', 'AC', 'GND'];
    const cur = state[chKey].coupling;
    state[chKey].coupling = order[(order.indexOf(cur) + 1) % order.length];
    updateAllUI(`${chKey}_coupling`);
  }

  function handleSoftkeyPress(index) {
    const chKey = state.activeMenuChannel === 'CH2' ? 'ch2' : 'ch1';
    const ch = state[chKey];

    switch (index) {
      case 0:
        cycleCoupling(chKey);
        break;
      case 1:
        ch.bwLimit = !ch.bwLimit;
        break;
      case 2:
        ch.probe = ch.probe === 1 ? 10 : 1;
        break;
      case 3:
        ch.invert = !ch.invert;
        break;
      case 4:
        break;
    }
    updateAllUI(`softkey_${index}`);
  }

  // ==================== 13. 信号发生器预设与参数绑定 ====================
  function applySignalPreset(presetName) {
    document.querySelectorAll('.preset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.preset === presetName);
    });

    switch (presetName) {
      case 'cal':
        state.sig1 = { wave: 'square', freq: 1000, amp: 3.3, offset: 1.65 };
        state.sig2 = { wave: 'sine', freq: 1000, amp: 2.0, offset: 0, phase: 90 };
        break;
      case 'sine50':
        state.sig1 = { wave: 'sine', freq: 1000, amp: 4.0, offset: 0.0 };
        state.sig2 = { wave: 'triangle', freq: 1000, amp: 3.0, offset: 0, phase: 45 };
        break;
      case 'ripple':
        state.sig1 = { wave: 'dc_ripple', freq: 2000, amp: 0.16, offset: 5.0 };
        state.ch1.coupling = 'DC';
        state.ch1.voltIdx = 7; // 2V/div 先展示5V直流高压
        state.ch1.pos = -1.5;
        state.trig.level = 0.0;
        break;
      case 'lissajous':
        state.sig1 = { wave: 'sine', freq: 1000, amp: 4.0, offset: 0.0 };
        state.sig2 = { wave: 'sine', freq: 1000, amp: 4.0, offset: 0.0, phase: 90 };
        state.ch1.enabled = true;
        state.ch2.enabled = true;
        state.ch1.voltIdx = 6;
        state.ch2.voltIdx = 6;
        break;
      case 'glitch':
        state.sig1 = { wave: 'pulse', freq: 1000, amp: 4.0, offset: 0.0 };
        // 故意将触发电平设高，让用户体验未触发滚动并手动调回
        state.trig.level = 3.2;
        break;
    }

    syncSignalInputsFromState();
    updateAllUI(`preset_${presetName}`);
  }

  function syncSignalInputsFromState() {
    document.getElementById('sig1Wave').value = state.sig1.wave;
    document.getElementById('sig1Freq').value = state.sig1.freq;
    document.getElementById('sig1Amp').value = state.sig1.amp;
    document.getElementById('sig1Offset').value = state.sig1.offset;

    document.getElementById('sig2Wave').value = state.sig2.wave;
    document.getElementById('sig2Freq').value = state.sig2.freq;
    document.getElementById('sig2Amp').value = state.sig2.amp;
    document.getElementById('sig2Phase').value = state.sig2.phase;
  }

  // ==================== 14. 中 / 英 / 双语面板实时切换引擎 ====================
  function setLanguageMode(lang) {
    state.lang = lang;
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // 1. 更新通用 UI 文案 (双语模式下默认使用中文 UI + 双语面板按键)
    const dict = lang === 'en' ? UI_I18N.en : UI_I18N.zh;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });

    // 2. 更新示波器前面板所有丝印标签 (支持纯中 / 纯英 / 中英双语对照)
    document.querySelectorAll('[data-panel-zh]').forEach((el) => {
      const zh = el.dataset.panelZh;
      const en = el.dataset.panelEn;
      if (lang === 'zh') {
        el.textContent = zh;
      } else if (lang === 'en') {
        el.textContent = en;
      } else {
        el.innerHTML = `${zh}<br><small style="font-family:var(--font-mono);font-size:0.86em;opacity:0.82">${en}</small>`;
      }
    });
  }

  // ==================== 15. 右侧按键详解器 & 6步实操课 & 全词典 ====================
  function inspectControl(ctrlId) {
    const doc = CONTROL_DOCS[ctrlId];
    if (!doc) return;

    document.getElementById('inspZoneBadge').textContent = doc.zone;
    document.getElementById('inspTitleZh').textContent = doc.zh;
    document.getElementById('inspTitleEn').textContent = doc.en;
    document.getElementById('inspDesc').textContent = doc.desc;
    document.getElementById('inspTip').textContent = doc.tip;
  }

  function highlightControlOnPanel(ctrlId) {
    document.querySelectorAll('.ctrl-highlight').forEach((el) => el.classList.remove('ctrl-highlight'));
    const target = document.querySelector(`[data-ctrl-id="${ctrlId}"]`);
    if (target) {
      target.classList.add('ctrl-highlight');
      inspectControl(ctrlId);
      setTimeout(() => target.classList.remove('ctrl-highlight'), 3200);
    }
  }

  function renderLessonUI() {
    const nav = document.getElementById('lessonStepsNav');
    nav.innerHTML = LESSONS.map((les, idx) => {
      const isDone = state.completedLessons.has(les.id);
      const isActive = idx === state.currentLessonIdx;
      return `<button class="step-dot-btn ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}" data-lesson-idx="${idx}">
        ${isDone ? '✓' : idx + 1}
      </button>`;
    }).join('');

    nav.querySelectorAll('.step-dot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.currentLessonIdx = Number(btn.dataset.lessonIdx);
        renderLessonUI();
      });
    });

    const curLesson = LESSONS[state.currentLessonIdx];
    const isPassed = state.completedLessons.has(curLesson.id);

    document.getElementById('lessonProgressText').textContent =
      `已完成 ${state.completedLessons.size} / ${LESSONS.length}`;
    document.getElementById('lessonStepTag').textContent = curLesson.tag;

    const badge = document.getElementById('lessonCheckBadge');
    badge.textContent = isPassed ? '✓ 本课已达标过关！' : '等待实操验证...';
    badge.classList.toggle('passed', isPassed);

    document.getElementById('lessonTitle').textContent = curLesson.title;
    document.getElementById('lessonGoal').textContent = curLesson.goal;
    document.getElementById('lessonTaskDesc').textContent = curLesson.task;
    document.getElementById('lessonPrinciple').textContent = curLesson.principle;
  }

  function evaluateLessonProgress(lastAction) {
    const curLesson = LESSONS[state.currentLessonIdx];
    if (!curLesson) return;

    if (curLesson.check(state, lastAction)) {
      if (!state.completedLessons.has(curLesson.id)) {
        state.completedLessons.add(curLesson.id);
        renderLessonUI();
      }
    }
  }

  function renderGlossaryList(filterText = '') {
    const container = document.getElementById('glossaryList');
    const q = filterText.trim().toLowerCase();

    const entries = Object.entries(CONTROL_DOCS).filter(([, doc]) => {
      if (!q) return true;
      return (
        doc.zh.toLowerCase().includes(q) ||
        doc.en.toLowerCase().includes(q) ||
        doc.desc.toLowerCase().includes(q)
      );
    });

    container.innerHTML = entries
      .map(
        ([ctrlId, doc]) => `
      <div class="glossary-item" data-glossary-ctrl="${ctrlId}">
        <div class="glossary-item-top">
          <strong>${doc.zh}</strong>
          <span>${doc.en}</span>
        </div>
        <p>${doc.desc}</p>
      </div>
    `
      )
      .join('');

    container.querySelectorAll('.glossary-item').forEach((item) => {
      item.addEventListener('click', () => {
        highlightControlOnPanel(item.dataset.glossaryCtrl);
      });
    });
  }

  // ==================== 16. 屏幕光标拖拽交互 ====================
  function initCanvasCursorDragging() {
    function getGridCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;

      const padL = 22, padR = 22, padT = 18, padB = 18;
      const plotW = canvas.width - padL - padR;
      const plotH = canvas.height - padT - padB;
      const cellW = plotW / GRID_COLS;
      const cellH = plotH / GRID_ROWS;
      const centerX = padL + plotW / 2;
      const centerY = padT + plotH / 2;

      return {
        divX: (px - centerX) / cellW,
        divY: (centerY - py) / cellH
      };
    }

    canvas.addEventListener('mousedown', (e) => {
      if (!state.showCursors) return;
      const { divX, divY } = getGridCoords(e);
      const candidates = [
        { key: 'x1', dist: Math.abs(divX - state.cursors.x1) },
        { key: 'x2', dist: Math.abs(divX - state.cursors.x2) },
        { key: 'y1', dist: Math.abs(divY - state.cursors.y1) },
        { key: 'y2', dist: Math.abs(divY - state.cursors.y2) }
      ].sort((a, b) => a.dist - b.dist);

      if (candidates[0].dist < 0.6) {
        state.cursors.dragging = candidates[0].key;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.cursors.dragging) return;
      const { divX, divY } = getGridCoords(e);
      const key = state.cursors.dragging;
      if (key === 'x1' || key === 'x2') {
        state.cursors[key] = Math.max(-4.9, Math.min(4.9, +divX.toFixed(2)));
      } else {
        state.cursors[key] = Math.max(-3.9, Math.min(3.9, +divY.toFixed(2)));
      }
      updateAllUI('cursor_drag');
    });

    window.addEventListener('mouseup', () => {
      state.cursors.dragging = null;
    });
  }

  // ==================== 17. 事件监听绑定与主循环启动 ====================
  function bindAllEvents() {
    // 任意带 data-ctrl-id 的控件悬停或点击时，在右侧百科卡片实时展示详解
    document.querySelectorAll('[data-ctrl-id]').forEach((el) => {
      const ctrlId = el.dataset.ctrlId;
      el.addEventListener('mouseenter', () => inspectControl(ctrlId));
      el.addEventListener('focus', () => inspectControl(ctrlId));
      el.addEventListener('click', () => inspectControl(ctrlId));
    });

    // 语言切换
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => setLanguageMode(btn.dataset.lang));
    });

    // 信号发生器预设与输入框
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => applySignalPreset(btn.dataset.preset));
    });

    const bindSigInput = (id, targetObj, prop, isNum = true) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        targetObj[prop] = isNum ? Number(el.value) : el.value;
        updateAllUI('sig_input_changed');
      });
    };

    bindSigInput('sig1Wave', state.sig1, 'wave', false);
    bindSigInput('sig1Freq', state.sig1, 'freq');
    bindSigInput('sig1Amp', state.sig1, 'amp');
    bindSigInput('sig1Offset', state.sig1, 'offset');

    bindSigInput('sig2Wave', state.sig2, 'wave', false);
    bindSigInput('sig2Freq', state.sig2, 'freq');
    bindSigInput('sig2Amp', state.sig2, 'amp');
    bindSigInput('sig2Phase', state.sig2, 'phase');

    // 系统与运行控制按键
    document.getElementById('btnAutoScale').addEventListener('click', runAutoScale);
    document.getElementById('btnRunStop').addEventListener('click', () => {
      state.running = !state.running;
      state.singleArmed = false;
      updateAllUI('run_stop');
    });
    document.getElementById('btnSingle').addEventListener('click', () => {
      state.singleArmed = true;
      state.running = true;
      updateAllUI('single_armed');
    });
    document.getElementById('btnDefault').addEventListener('click', resetDefaultSetup);
    document.getElementById('btnMeasure').addEventListener('click', () => {
      state.showMeasure = !state.showMeasure;
      updateAllUI('toggle_measure');
    });
    document.getElementById('btnCursor').addEventListener('click', () => {
      state.showCursors = !state.showCursors;
      updateAllUI('toggle_cursors');
    });
    document.getElementById('btnAcquire').addEventListener('click', () => {
      state.persist = !state.persist;
      updateAllUI('toggle_persist');
    });
    document.getElementById('btnDisplayXY').addEventListener('click', () => {
      state.xyMode = !state.xyMode;
      if (state.xyMode) {
        state.ch1.enabled = true;
        state.ch2.enabled = true;
      }
      updateAllUI('toggle_xy');
    });

    // 水平与触发区按键
    document.getElementById('btnHPosZero').addEventListener('click', () => {
      state.hPos = 0;
      updateAllUI('hpos_zero');
    });
    document.getElementById('btnTrig50').addEventListener('click', () => {
      setTrigger50Percent();
      updateAllUI('trig_50');
    });
    document.getElementById('btnTrigMode').addEventListener('click', () => {
      state.trig.mode = state.trig.mode === 'AUTO' ? 'NORMAL' : 'AUTO';
      updateAllUI('trig_mode');
    });
    document.getElementById('btnTrigSlope').addEventListener('click', () => {
      state.trig.slope = state.trig.slope === 'RISING' ? 'FALLING' : 'RISING';
      updateAllUI('trig_slope');
    });
    document.getElementById('btnTrigSource').addEventListener('click', () => {
      state.trig.source = state.trig.source === 'CH1' ? 'CH2' : 'CH1';
      updateAllUI('trig_source');
    });
    document.getElementById('btnTrigForce').addEventListener('click', () => {
      state.frozenFrame = null;
      const prevRun = state.running;
      state.running = true;
      renderScopeScreen();
      state.running = prevRun;
      updateAllUI('trig_force');
    });

    // 垂直区按键
    document.getElementById('btnCh1PosZero').addEventListener('click', () => {
      state.ch1.pos = 0;
      updateAllUI('ch1_zero');
    });
    document.getElementById('btnCh2PosZero').addEventListener('click', () => {
      state.ch2.pos = 0;
      updateAllUI('ch2_zero');
    });

    document.getElementById('btnCh1Toggle').addEventListener('click', () => {
      if (!state.ch1.enabled) {
        state.ch1.enabled = true;
        state.activeMenuChannel = 'CH1';
      } else if (state.activeMenuChannel !== 'CH1') {
        state.activeMenuChannel = 'CH1';
      } else {
        state.ch1.enabled = false;
      }
      updateAllUI('ch1_toggle');
    });

    document.getElementById('btnCh2Toggle').addEventListener('click', () => {
      if (!state.ch2.enabled) {
        state.ch2.enabled = true;
        state.activeMenuChannel = 'CH2';
      } else if (state.activeMenuChannel !== 'CH2') {
        state.activeMenuChannel = 'CH2';
      } else {
        state.ch2.enabled = false;
      }
      updateAllUI('ch2_toggle');
    });

    document.getElementById('bncCh1').addEventListener('click', () => {
      state.ch1.enabled = !state.ch1.enabled;
      if (state.ch1.enabled) state.activeMenuChannel = 'CH1';
      updateAllUI('bnc_ch1');
    });
    document.getElementById('bncCh2').addEventListener('click', () => {
      state.ch2.enabled = !state.ch2.enabled;
      if (state.ch2.enabled) state.activeMenuChannel = 'CH2';
      updateAllUI('bnc_ch2');
    });

    document.getElementById('btnMathToggle').addEventListener('click', () => {
      const modes = ['OFF', 'CH1+CH2', 'CH1-CH2'];
      state.math.mode = modes[(modes.indexOf(state.math.mode) + 1) % modes.length];
      if (state.math.mode !== 'OFF') {
        state.ch1.enabled = true;
        state.ch2.enabled = true;
      }
      updateAllUI('math_toggle');
    });

    document.getElementById('btnCh1Coupling').addEventListener('click', () => cycleCoupling('ch1'));
    document.getElementById('btnCh2Coupling').addEventListener('click', () => cycleCoupling('ch2'));

    const connectProbeComp = () => {
      applySignalPreset('cal');
      runAutoScale();
    };
    document.getElementById('btnProbeComp').addEventListener('click', connectProbeComp);
    document.getElementById('lugProbeComp').addEventListener('click', connectProbeComp);

    // 屏幕右侧软键列 (实体 F1~F5 及屏幕内菜单项均可点击)
    document.querySelectorAll('.hw-softkey').forEach((btn) => {
      btn.addEventListener('click', () => handleSoftkeyPress(Number(btn.dataset.softkey)));
    });
    for (let i = 0; i < 5; i++) {
      const item = document.getElementById(`softItem${i}`);
      if (item) item.addEventListener('click', () => handleSoftkeyPress(i));
    }

    // 教学选项卡与课程导航
    document.querySelectorAll('.tut-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tut-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('paneLessons').classList.toggle('hidden', target !== 'lessons');
        document.getElementById('paneGlossary').classList.toggle('hidden', target !== 'glossary');
      });
    });

    document.getElementById('btnHighlightTarget').addEventListener('click', () => {
      const curLesson = LESSONS[state.currentLessonIdx];
      if (curLesson) highlightControlOnPanel(curLesson.targetCtrl);
    });

    document.getElementById('btnNextLesson').addEventListener('click', () => {
      state.currentLessonIdx = (state.currentLessonIdx + 1) % LESSONS.length;
      renderLessonUI();
    });

    document.getElementById('glossarySearch').addEventListener('input', (e) => {
      renderGlossaryList(e.target.value);
    });

    // ==================== 19. 底部零基础新手知识学院交互逻辑 ====================
    initBeginnerAcademy();
  }

  const PIPELINE_DOCS = {
    probe: {
      step: 'STEP 01 · 信号入口',
      title: '示波器探头 (Probe 1X / 10X)',
      analogy: '就像医生的听诊器：既要清晰听到被测电路的电压心跳，又绝不能因为接上探头而“偷走”电流导致电路停振（负载效应）。',
      explain: '普通长导线有近 100pF 寄生电容会把高频短路。探头在 10X 挡下构成 10MΩ 高阻抗 + ~10pF 超低电容分压器，保证满带宽测量。',
      ctrlName: 'BNC 接口 & 软键 F3 (探头比 1X/10X)',
      ctrlId: 'softkey_f3'
    },
    afe: {
      step: 'STEP 02 · 垂直调理',
      title: '模拟前端 (AFE: 耦合与衰减放大)',
      analogy: '就像相机的光圈与滤镜：不管来的是几毫伏微弱信号还是几十伏强电，都先缩放到最适合 ADC 接收的量程窗口内。',
      explain: '包含 AC/DC 隔直电容继电器、可变衰减器与放大器（拧 Volts/Div 听到真机咔哒声就是在切继电器）及 20MHz 低通滤波。',
      ctrlName: '垂直区【伏/格 Volts/Div】与【耦合 DC/AC】',
      ctrlId: 'knob_ch1_scale'
    },
    adc: {
      step: 'STEP 03 · 数字化采样',
      title: '高速 ADC 模数转换器 (GSa/s)',
      analogy: '每秒连拍 10 亿张快照（1 GSa/s）的高速相机，把连续变化的电压切成密集的数字坐标点。',
      explain: '横向看采样率（1 GSa/s = 每隔 1ns 采一点），纵向看量化位数（8-bit 为 256 级台阶，新一代 12-bit HD 为 4096 级台阶）。',
      ctrlName: '水平区【秒/格 Sec/Div】时基大旋钮',
      ctrlId: 'knob_sec_div'
    },
    trigger: {
      step: 'STEP 04 · 同步灵魂',
      title: '硬件触发比较器 (Trigger)',
      analogy: '给高速旋转的风扇拍频闪照：只有每次严格在“叶片转到同一角度（跨过触发电平）”那一瞬间按快门，画面才不会重影乱滚！',
      explain: '实时比对输入电压与 Trigger Level 虚线：一旦检测到上升沿（↑）或下降沿（↓）穿越阈值，立即发出同步锁存指令对齐波形起点。',
      ctrlName: '触发区【触发电平 Level】&【触发边沿 Slope】',
      ctrlId: 'knob_trig_level'
    },
    memory: {
      step: 'STEP 05 · 环形波形仓库',
      title: '高速采集存储器 (Memory Depth)',
      analogy: '就像行车记录仪的循环录像卡：后台源源不断写入数据，收到触发信号那一刻，把碰撞点前后的整段波形一起冻结保存！',
      explain: '决定了你能不能回看“触发前的历史波形”，以及大时基抓长通信包后按下 STOP 放大还能不能看清高频细节。',
      ctrlName: '系统区【运行/停止 Run/Stop】&【单次 Single】',
      ctrlId: 'btn_single'
    },
    display: {
      step: 'STEP 06 · 荧光成像',
      title: '数字荧光处理与屏幕渲染 (DPO)',
      analogy: '把成千上万帧波形像半透明胶片一样叠印在屏幕上：常走的主轨迹最亮，偶发闪现的异常毛刺也会留下荧光残影。',
      explain: 'FPGA/DSP 执行 sin(x)/x 内插、自动参数统计（Vpp/Freq/Duty）、数学差分运算（CH1-CH2）及多级亮度余晖合成。',
      ctrlName: '系统区【余晖 Persist】、【测量 Measure】与【Math】',
      ctrlId: 'btn_persist'
    }
  };

  const DECK_PAGE_TITLES = [
    '工作原理信号链',
    '四大指标与选型',
    '四类示波器演进',
    '主流品牌与神机',
    '防炸机与10X探头'
  ];

  function initBeginnerAcademy() {
    let currentDeckPage = 0;
    let currentPipeCtrlId = 'softkey_f3';
    const totalPages = 5;

    // 1. 5页画册翻页控制器
    function goToDeckPage(pageIdx) {
      currentDeckPage = Math.max(0, Math.min(totalPages - 1, pageIdx));

      document.querySelectorAll('.deck-page').forEach((p) => {
        p.classList.toggle('hidden', Number(p.dataset.deckPage) !== currentDeckPage);
        p.classList.toggle('active', Number(p.dataset.deckPage) === currentDeckPage);
      });

      document.querySelectorAll('.chapter-pill').forEach((pill) => {
        pill.classList.toggle('active', Number(pill.dataset.page) === currentDeckPage);
      });

      document.querySelectorAll('.ddot').forEach((dot) => {
        dot.classList.toggle('active', Number(dot.dataset.page) === currentDeckPage);
      });

      const pageNumEl = document.getElementById('deckPageNum');
      if (pageNumEl) pageNumEl.textContent = String(currentDeckPage + 1);

      const barEl = document.getElementById('deckProgressBar');
      if (barEl) barEl.style.width = `${((currentDeckPage + 1) / totalPages) * 100}%`;

      const prevBtn = document.getElementById('btnDeckPrev');
      const nextBtn = document.getElementById('btnDeckNext');
      if (prevBtn) {
        prevBtn.disabled = currentDeckPage === 0;
        prevBtn.textContent = currentDeckPage > 0
          ? `← 上一页：${DECK_PAGE_TITLES[currentDeckPage - 1]}`
          : '← 上一页';
      }
      if (nextBtn) {
        if (currentDeckPage < totalPages - 1) {
          nextBtn.textContent = `下一页：${DECK_PAGE_TITLES[currentDeckPage + 1]} →`;
        } else {
          nextBtn.textContent = '↺ 回到第 1 页';
        }
      }
    }

    document.querySelectorAll('.chapter-pill, .ddot').forEach((btn) => {
      btn.addEventListener('click', () => goToDeckPage(Number(btn.dataset.page)));
    });

    const prevBtn = document.getElementById('btnDeckPrev');
    const nextBtn = document.getElementById('btnDeckNext');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => goToDeckPage(currentDeckPage - 1));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentDeckPage < totalPages - 1) goToDeckPage(currentDeckPage + 1);
        else goToDeckPage(0);
      });
    }

    // 支持键盘左右方向键翻页（当焦点不在输入框时）
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') goToDeckPage((currentDeckPage + 1) % totalPages);
      if (e.key === 'ArrowLeft') goToDeckPage((currentDeckPage - 1 + totalPages) % totalPages);
    });

    // 2. 第 1 页：6 级信号链路节点点击切换与联动定位
    document.querySelectorAll('.pipe-node').forEach((node) => {
      node.addEventListener('click', () => {
        document.querySelectorAll('.pipe-node').forEach((n) => n.classList.remove('active'));
        node.classList.add('active');

        const key = node.dataset.pipe;
        const info = PIPELINE_DOCS[key];
        if (!info) return;

        currentPipeCtrlId = info.ctrlId;
        document.getElementById('pipeDetailStep').textContent = info.step;
        document.getElementById('pipeDetailTitle').textContent = info.title;
        document.getElementById('pipeDetailAnalogy').textContent = info.analogy;
        document.getElementById('pipeDetailExplain').textContent = info.explain;
        document.getElementById('pipeDetailCtrlName').textContent = info.ctrlName;
      });
    });

    const btnPipeLocate = document.getElementById('btnPipeLocate');
    if (btnPipeLocate) {
      btnPipeLocate.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => highlightControlOnPanel(currentPipeCtrlId), 350);
      });
    }

    // 3. 第 2 页：滑动条式选型带宽 & 采样率计算器 (5倍法则)
    const calcInput = document.getElementById('calcInputFreq');
    if (calcInput) {
      const updateCalculator = () => {
        const fMhz = Math.max(1, Number(calcInput.value) || 20);
        const freqLbl = document.getElementById('calcFreqLabel');
        if (freqLbl) freqLbl.textContent = String(fMhz);

        const recBwMhz = fMhz * 5;
        const recSrGsa = (recBwMhz * 5) / 1000;
        const stdBws = [50, 70, 100, 200, 350, 500, 1000];
        const matchedStd = stdBws.find((b) => b >= recBwMhz) || 1000;

        document.getElementById('calcOutBW').textContent =
          `≥ ${recBwMhz} MHz (选 ${matchedStd}MHz 档)`;
        document.getElementById('calcOutSR').textContent =
          recSrGsa >= 1 ? `≥ ${recSrGsa.toFixed(1)} GSa/s` : `≥ ${(recSrGsa * 1000).toFixed(0)} MSa/s`;

        let tierText = '主流 12-bit 入门台式机 (普源 DHO804 / 鼎阳 SDS804X HD · ¥2000左右)';
        if (matchedStd <= 70) {
          tierText = '高性价比入门机 (普源 DHO802 / DS1054Z / 梦源便携 · ¥600~¥1999)';
        } else if (matchedStd > 100 && matchedStd <= 350) {
          tierText = '进阶研发主力 (普源 MSO5074 / 鼎阳 SDS2000X HD / 泰克 TBS2000B)';
        } else if (matchedStd > 350) {
          tierText = '高端高速旗舰 (是德科技 3000T/HD3 / 泰克 MSO4B / R&S MXO4)';
        }
        document.getElementById('calcOutTier').textContent = tierText;
      };

      calcInput.addEventListener('input', updateCalculator);
      updateCalculator();
    }

    // 4. 第 4 页：主流品牌机型按场景筛选
    document.querySelectorAll('.mfilter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mfilter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.mfilter;

        document.querySelectorAll('.model-card').forEach((card) => {
          const cats = card.dataset.mcat || '';
          const show = cat === 'all' || cats.includes(cat);
          card.classList.toggle('hidden-card', !show);
        });
      });
    });

    // 5. 第 5 页：1X vs 10X 探头拨杆交互波形对比模拟器
    document.querySelectorAll('.procker-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.procker-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.psim;
        const pathEl = document.getElementById('psimWavePath');
        const lblEl = document.getElementById('psimWaveLabel');
        const bwEl = document.getElementById('psimBwVal');
        const impEl = document.getElementById('psimImpVal');
        const effEl = document.getElementById('psimEffectVal');

        if (mode === '1x') {
          pathEl.setAttribute('d', 'M16,52 C32,52 34,26 48,26 C62,26 64,52 82,52 C100,52 102,26 118,26 C134,26 136,52 154,52 C172,52 174,26 190,26 C206,26 208,52 224,52');
          pathEl.setAttribute('stroke', '#ff3b4e');
          lblEl.setAttribute('fill', '#ff3b4e');
          lblEl.textContent = '1X 挡：带宽暴跌至 ~6MHz！10MHz 方波严重畸变成圆角正弦波';
          bwEl.textContent = '仅 ~6 MHz (高频被滤除)';
          bwEl.className = 'bad';
          impEl.textContent = '1 MΩ // ~100 pF (重电容负载)';
          effEl.textContent = '极易导致无源晶振直接停振！';
        } else {
          pathEl.setAttribute('d', 'M16,56 L16,18 L56,18 L56,56 L96,56 L96,18 L136,18 L136,56 L176,56 L176,18 L216,18 L216,56');
          pathEl.setAttribute('stroke', '#22e568');
          lblEl.setAttribute('fill', '#22e568');
          lblEl.textContent = '10X 挡：带宽满血 100MHz+，方波边缘锐利真实';
          bwEl.textContent = '100 ~ 200 MHz (满血带宽)';
          bwEl.className = 'ok';
          impEl.textContent = '10 MΩ // ~10 pF (极轻负载)';
          effEl.textContent = '几乎无干扰，日常99%场景必选';
        }
      });
    });

    goToDeckPage(0);
  }

  // ==================== 18. 初始化入口 ====================
  function init() {
    initRotaryKnobs();
    initCanvasCursorDragging();
    bindAllEvents();
    renderLessonUI();
    renderGlossaryList();
    updateAllUI();

    function loop() {
      renderScopeScreen();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  init();
})();
