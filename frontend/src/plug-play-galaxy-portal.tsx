import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { PlugPlayGalaxy } from "./plug-play-galaxy";

const HOST_ATTRIBUTE = "data-plug-play-galaxy-host";

export function PlugPlayGalaxyPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function syncHost() {
      const solution = document.querySelector<HTMLElement>(".solution-section");
      const existing = document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`);

      if (!solution) {
        existing?.remove();
        setHost(null);
        return;
      }

      if (existing) {
        if (existing.previousElementSibling !== solution) solution.insertAdjacentElement("afterend", existing);
        setHost(existing);
        return;
      }

      const next = document.createElement("div");
      next.setAttribute(HOST_ATTRIBUTE, "");
      next.className = "relative z-[3]";
      solution.insertAdjacentElement("afterend", next);
      setHost(next);
    }

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`)?.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<PlugPlayGalaxy />, host) : null;
}
