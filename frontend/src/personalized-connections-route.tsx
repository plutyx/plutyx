import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "./app";
import { ConnectionActivationQueue } from "./connection-activation-queue";
import { ConnectionMissionControlPortal } from "./connection-mission-control";
import { ConnectionsHubRoute } from "./connections-hub";
import { IntegrationHealthPulsePortal } from "./integration-health-pulse-v73";
import { IntegrationMissionPathPortal } from "./integration-mission-path-v62";
import { IntegrationPassportPortal } from "./integration-passport-v65";
import { MigrationStudioPortal } from "./migration-studio-v70";
import { PagBankConnectionCardPortal } from "./pagbank-connection-card";
import { ConnectionOrbitV74 } from "./connection-orbit-v74";

type ProviderId = "whatsapp" | "ifood" | "mercadopago" | "google" | "meta_ads";
type Intent = { providers: ProviderId[]; signal?: string; updated_at?: string };
type IntegrationProfile = {
  business_id: number;
  order_source: "direct" | "whatsapp" | "ifood" | "mixed";
  use_mercadopago: boolean;
  use_google: boolean;
  use_meta_ads: boolean;
  configured_at: string | null;
};

const PROFILE_API =
  import.meta.env.VITE_PROFILE_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-profile-v31";

function readIntent(): Intent | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem("c360_discovery_connection_intent") || "null",
    );
    if (!raw || !Array.isArray(raw.providers) || !raw.providers.length) return null;
    const allowed = new Set<ProviderId>([
      "whatsapp",
      "ifood",
      "mercadopago",
      "google",
      "meta_ads",
    ]);
    const providers = raw.providers.filter((id: ProviderId) => allowed.has(id));
    return providers.length ? { ...raw, providers } : null;
  } catch {
    return null;
  }
}

function planFromIntent(profile: IntegrationProfile, intent: Intent) {
  const selected = new Set(intent.providers);
  const whatsapp = selected.has("whatsapp");
  const ifood = selected.has("ifood");
  const order_source: IntegrationProfile["order_source"] =
    whatsapp && ifood ? "mixed" : whatsapp ? "whatsapp" : ifood ? "ifood" : "direct";
  return {
    ...profile,
    order_source,
    use_mercadopago: selected.has("mercadopago"),
    use_google: selected.has("google"),
    use_meta_ads: selected.has("meta_ads"),
  };
}

async function profileRequest(path: string, options: RequestInit, token: string) {
  const response = await fetch(`${PROFILE_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível restaurar sua rota");
  return body;
}

export function PersonalizedConnectionsRoute() {
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [hasIntent, setHasIntent] = useState(() => Boolean(readIntent()));

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      const token = localStorage.getItem("c360_token") || "";
      const intent = readIntent();
      setHasIntent(Boolean(intent));
      if (!token || !intent) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const me = await request("/me", {}, token);
        const businessId = Number(me.businesses?.[0]?.id || 0);
        if (!businessId) return;
        const current = await profileRequest(
          `/businesses/${businessId}/profile`,
          {},
          token,
        );
        const profile = current.profile as IntegrationProfile;
        if (profile?.configured_at) return;

        const next = planFromIntent(profile, intent);
        await profileRequest(
          `/businesses/${businessId}/profile`,
          {
            method: "PUT",
            body: JSON.stringify({
              order_source: next.order_source,
              use_mercadopago: next.use_mercadopago,
              use_google: next.use_google,
              use_meta_ads: next.use_meta_ads,
            }),
          },
          token,
        );
        localStorage.setItem(
          "c360_discovery_connection_intent_applied",
          JSON.stringify({
            business_id: businessId,
            providers: intent.providers,
            applied_at: new Date().toISOString(),
          }),
        );
        if (!cancelled) setRestored(true);
      } catch {
        // Discovery handoff must never block the real connection hub.
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <main className="cx-shell cx-center">
        <div className="cx-loader">
          <Loader2 /> RECONSTRUINDO SUA ROTA
        </div>
      </main>
    );
  }

  return (
    <>
      {hasIntent && <ConnectionActivationQueue restored={restored} />}
      <ConnectionsHubRoute />
      <ConnectionOrbitV74 />
      <IntegrationHealthPulsePortal />
      <IntegrationPassportPortal />
      <MigrationStudioPortal />
      <IntegrationMissionPathPortal />
      <ConnectionMissionControlPortal />
      <PagBankConnectionCardPortal />
    </>
  );
}
