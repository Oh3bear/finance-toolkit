import { useState, useEffect, useRef } from 'react';

/**
 * 数字 count-up 动画 hook
 * 从 0 增长到目标值，支持 duration 和 decimals
 */
export function useCountUp(target: number, duration: number = 800, decimals: number = 0): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }

    startRef.current = performance.now();
    const startVal = 0;

    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo 缓动
      const eased = 1 - Math.pow(2, -10 * progress);
      const value = startVal + (target - startVal) * eased;
      setCurrent(Number(value.toFixed(decimals)));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, decimals]);

  return current;
}
