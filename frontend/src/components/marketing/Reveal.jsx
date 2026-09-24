import { motion, useReducedMotion } from "framer-motion";

/**
 * Reveal on scroll. With prefers-reduced-motion it still fades in, but does
 * not travel: a fade is not the movement that setting asks to stop, and
 * without it the page arrived dead on phones set to reduce motion.
 */
export default function Reveal({ children, delay = 0, y = 18, className = "", as = "div" }) {
  const still = useReducedMotion();
  const Tag = motion[as] || motion.div;

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: still ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </Tag>
  );
}

export function Stagger({ children, className = "", step = 0.07 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ shown: { transition: { staggerChildren: step } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", y = 16 }) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: still ? 0 : y },
        shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
