import { useState, useEffect, useCallback } from 'react';

const MESSAGES = [
  '对账完成！',
  '让我看看...',
  '数据没问题！',
  '冲销匹配成功',
  'M:N 合并搞定',
  '休息一下~',
  '加油对账！',
  '完全对符！',
  '发现问题！',
  '继续加油！',
];

type DinoMode = 'idle' | 'walk' | 'jump';

interface PixelDinoProps {
  size?: number;
  className?: string;
  mode?: DinoMode;
  showBubble?: boolean;
  bubbleText?: string;
}

export function PixelDino({ size = 120, className = '', mode: controlledMode, showBubble: controlledBubble, bubbleText }: PixelDinoProps) {
  const [mode, setMode] = useState<DinoMode>(controlledMode || 'idle');
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleMsg, setBubbleMsg] = useState(bubbleText || MESSAGES[0]);

  // 眨眼动画
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (controlledMode) setMode(controlledMode);
  }, [controlledMode]);

  const handleClick = useCallback(() => {
    if (mode === 'walk') {
      setMode('jump');
      setTimeout(() => setMode('idle'), 600);
    } else {
      const msg = bubbleText || MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      setBubbleMsg(msg);
      setBubbleVisible(true);
      setTimeout(() => setBubbleVisible(false), 2000);
    }
  }, [mode, bubbleText]);

  const px = size / 24;
  const bodyColor = '#10b981';
  const darkColor = '#059669';
  const bellyColor = '#6ee7b7';
  const spineColor = '#facc7a';
  const eyeWhite = '#fff';
  const eyePupil = '#064e3b';

  // 经典像素恐龙坐标 (24x18 grid)
  // 格式: [x, y, color]
  const pixels: [number, number, string][] = [
    // ========== 头部 (大且方) ==========
    [10, 2, bodyColor], [11, 2, bodyColor], [12, 2, bodyColor], [13, 2, bodyColor],
    [9, 3, bodyColor], [10, 3, bodyColor], [11, 3, bodyColor], [12, 3, bodyColor], [13, 3, bodyColor], [14, 3, bodyColor],
    [9, 4, bodyColor], [10, 4, bodyColor], [11, 4, bodyColor], [12, 4, bodyColor], [13, 4, bodyColor], [14, 4, bodyColor], [15, 4, bodyColor],
    [9, 5, bodyColor], [10, 5, bodyColor], [11, 5, bodyColor], [12, 5, bodyColor], [13, 5, bodyColor], [14, 5, bodyColor], [15, 5, bodyColor], [16, 5, bodyColor],
    [10, 6, bodyColor], [11, 6, bodyColor], [12, 6, bodyColor], [13, 6, bodyColor], [14, 6, bodyColor], [15, 6, bodyColor], [16, 6, bodyColor],

    // ========== 眼睛 ==========
    [12, 4, eyeWhite],
    [13, 4, blink ? bodyColor : eyePupil],

    // ========== 嘴巴（微笑线） ==========
    [15, 5, darkColor],
    [16, 5, darkColor],

    // ========== 脖子 ==========
    [10, 7, bodyColor], [11, 7, bodyColor], [12, 7, bodyColor],

    // ========== 背棘（明显尖刺） ==========
    [7, 5, spineColor],
    [6, 6, spineColor], [7, 6, spineColor],
    [5, 7, spineColor], [6, 7, spineColor], [7, 7, spineColor],
    [4, 8, spineColor], [5, 8, spineColor],
    [3, 9, spineColor], [4, 9, spineColor],

    // ========== 身体主体 ==========
    [6, 8, bodyColor], [7, 8, bodyColor], [8, 8, bodyColor], [9, 8, bodyColor], [10, 8, bodyColor], [11, 8, bodyColor], [12, 8, bodyColor],
    [5, 9, bodyColor], [6, 9, bodyColor], [7, 9, bodyColor], [8, 9, bodyColor], [9, 9, bodyColor], [10, 9, bodyColor], [11, 9, bodyColor], [12, 9, bodyColor], [13, 9, bodyColor],
    [5, 10, bodyColor], [6, 10, bodyColor], [7, 10, bodyColor], [8, 10, bodyColor], [9, 10, bodyColor], [10, 10, bodyColor], [11, 10, bodyColor], [12, 10, bodyColor], [13, 10, bodyColor],
    [6, 11, bodyColor], [7, 11, bodyColor], [8, 11, bodyColor], [9, 11, bodyColor], [10, 11, bodyColor], [11, 11, bodyColor], [12, 11, bodyColor], [13, 11, bodyColor],
    [7, 12, bodyColor], [8, 12, bodyColor], [9, 12, bodyColor], [10, 12, bodyColor], [11, 12, bodyColor], [12, 12, bodyColor],

    // ========== 肚子（浅色覆盖） ==========
    [8, 9, bellyColor], [9, 9, bellyColor], [10, 9, bellyColor], [11, 9, bellyColor],
    [8, 10, bellyColor], [9, 10, bellyColor], [10, 10, bellyColor], [11, 10, bellyColor],
    [8, 11, bellyColor], [9, 11, bellyColor], [10, 11, bellyColor],

    // ========== 小短手（T-Rex 风格） ==========
    [13, 10, bodyColor], [14, 10, bodyColor],
    [13, 11, bodyColor], [14, 11, bodyColor],

    // ========== 尾巴（细长翘起） ==========
    [4, 11, bodyColor], [5, 11, bodyColor],
    [3, 12, bodyColor], [4, 12, bodyColor],
    [2, 13, bodyColor], [3, 13, bodyColor],
    [1, 14, bodyColor], [2, 14, bodyColor],
    [0, 15, bodyColor], [1, 15, bodyColor],

    // ========== 前腿（粗壮） ==========
    [9, 13, darkColor], [10, 13, darkColor],
    [9, 14, darkColor], [10, 14, darkColor],
    [9, 15, darkColor], [10, 15, darkColor],

    // ========== 后腿（更粗壮） ==========
    [11, 13, darkColor], [12, 13, darkColor], [13, 13, darkColor],
    [11, 14, darkColor], [12, 14, darkColor], [13, 14, darkColor],
    [11, 15, darkColor], [12, 15, darkColor], [13, 15, darkColor],
  ];

  const getAnimation = () => {
    switch (mode) {
      case 'idle':
        return 'dino-breathe 2.5s ease-in-out infinite';
      case 'walk':
        return 'dino-walk 0.8s ease-in-out infinite';
      case 'jump':
        return 'dino-jump 0.6s ease-out';
      default:
        return 'none';
    }
  };

  return (
    <div className={`relative inline-block cursor-pointer select-none ${className}`} onClick={handleClick} style={{ width: size, height: size * 0.75 }}>
      {/* 气泡 */}
      {(bubbleVisible || controlledBubble) && (
        <div
          className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium z-10 transition-all duration-300"
          style={{
            background: '#fff',
            border: '1.5px solid #10b981',
            color: '#064e3b',
            opacity: bubbleVisible || controlledBubble ? 1 : 0,
            transform: `translateX(-50%) translateY(${bubbleVisible || controlledBubble ? 0 : 6}px)`,
          }}
        >
          {bubbleMsg}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: -6,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #10b981',
            }}
          />
        </div>
      )}

      {/* 恐龙 */}
      <div
        style={{
          position: 'relative',
          width: size,
          height: size * 0.75,
          animation: getAnimation(),
        }}
      >
        {pixels.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p[0] * px,
              top: p[1] * px,
              width: px,
              height: px,
              backgroundColor: p[2],
              borderRadius: px * 0.1,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes dino-breathe {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-${px * 0.5}px); }
        }
        @keyframes dino-walk {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-${px * 0.3}px) rotate(1deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-${px * 0.3}px) rotate(-1deg); }
        }
        @keyframes dino-jump {
          0% { transform: translateY(0) scale(1); }
          40% { transform: translateY(-${px * 8}px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
