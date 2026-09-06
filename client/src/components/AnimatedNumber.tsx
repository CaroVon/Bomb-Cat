import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

/** 数字跳动（积分/计数器 spring 驱动） */
export function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (v) =>
    format ? format(Math.round(v)) : Math.round(v).toLocaleString(),
  );
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  return <motion.span>{display}</motion.span>;
}
