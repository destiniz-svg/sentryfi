import { motion, useReducedMotion } from "framer-motion";

/**
 * Reveal on scroll. Honours prefers-reduced-motion by rendering the content
 * outright rather than animating it to zero duration, so nothing ever arrives
 * mid-transition for someone who asked for stillness.
 */
export default function Reveal({ children, delay = 0, y = 18, className = "", as = "div" }) {
  const still = useReducedMotion();
  const Tag = motion[as] || motion.div;

  if (still) return <div className={className}>{children}</div>;

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </Tag>
  );
}

export function Stagger({ children, className = "", step = 0.07 }) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
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
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
