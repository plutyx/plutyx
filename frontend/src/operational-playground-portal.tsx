import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiscoveryProgressRail } from "./discovery-progress";
import { OperationalPlayground } from "./operational-playground";
import "./discovery-upgrade.css";

const signalLabels = [
  ["Pedido fora do fluxo", "orders"],
  ["Produção atrasando", "production"],
  ["Estoque no limite", "stock"],
  ["Venda sem sobra", "margin"],
] as const;

function rememberSignal(signal: string) {
  try {
    const key = "c360_discovery_exploration";
    const previous = JSON.parse(localStorage.getItem(key) || "{}") as {
      signals?: string[];
      last_signal?: string;
      started_at?: string;
    };
    const signals = Array.from(new Set([...(previous.signals || []), signal]));
    const payload = {
      signals,
      last_signal: signal,
      started_at: previous.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
    window.dispatchEvent(
      new CustomEvent("c360:discovery-exploration", { detail: payload }),
    );
  } catch {
    // Exploration remains fully usable when local browser storage is unavailable.
  }
}

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

  useEffect(() => {
    if (!host) return;
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button || !host.contains(button)) return;
      const label = signalLabels.find(([text]) => button.textContent?.includes(text));
      if (label) rememberSignal(label[1]);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [host]);

  if (!host) return null;
  return createPortal(
    <>
      <OperationalPlayground
        onContinue={() => {
          try {
            const current = JSON.parse(
              localStorage.getItem("c360_discovery_exploration") || "{}",
            );
            localStorage.setItem(
              "c360_discovery_exploration",
              JSON.stringify({
                ...current,
                continued_to_map: true,
                continued_at: new Date().toISOString(),
              }),
            );
          } catch {
            // The journey does not depend on storage.
          }
          document
            .getElementById("mapa-da-operacao")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <DiscoveryProgressRail />
    </>,
    host,
  );
}