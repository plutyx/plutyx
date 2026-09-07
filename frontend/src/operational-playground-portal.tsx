import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { OperationalPlayground } from "./operational-playground";

export function DiscoveryPlaygroundPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;

    const sync = () => {
      const marquee = document.querySelector<HTMLElement>(".discovery-marquee");
      if (!marquee) {
        if (ownedHost && !ownedHost.isConnected) ownedHost = null;
        setHost(null);
        return;
      }

      const existing = document.querySelector<HTMLElement>(
        "[data-operational-playground-host]",
      );
      if (existing) {
        ownedHost = existing;
        setHost(existing);
        return;
      }

      const nextHost = document.createElement("div");
      nextHost.dataset.operationalPlaygroundHost = "true";
      nextHost.className = "operational-playground-host";
      marquee.insertAdjacentElement("afterend", nextHost);
      ownedHost = nextHost;
      setHost(nextHost);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (ownedHost?.isConnected) ownedHost.remove();
    };
  }, []);

  if (!host) return null;
  return createPortal(
    <OperationalPlayground
      onContinue={() =>
        document
          .getElementById("mapa-da-operacao")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    />,
    host,
  );
}
