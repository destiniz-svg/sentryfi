import { useEffect, useState } from "react";

/**
 * Which register a screen is in.
 *
 * Site Board has two, and they are not a breakpoint apart in style: the phone
 * board is square, loud and high contrast, built to be read at arm's length in
 * equatorial sun; the desk register is soft, dense and roomy, built for long
 * sessions at a desk. Serving the desk register to a phone is not "responsive",
 * it is the wrong design for the scene.
 *
 * 768px is where a tablet starts behaving like a desk. An installed app is
 * always the phone board regardless of width, because installing it is a
 * statement about where it is being used.
 */

const PHONE = "(max-width: 767px), (display-mode: standalone)";

export function usePhone() {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia(PHONE).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const onChange = (e) => setIsPhone(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isPhone;
}
