import { useEffect, useState } from "react";
export function useViewport() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const resize = () => setSize(read());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return {
    ...size,
    portrait: size.height >= size.width,
    stacked: size.height >= size.width || size.width <= 760,
  };
}
