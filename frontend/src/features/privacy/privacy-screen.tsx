"use client";

import { Database, KeyRound, LockKeyhole, ShieldCheck, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, API_URL, type PrivacyManifest } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

function ListBlock({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
          {icon}
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm leading-6 text-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PrivacyScreen() {
  const { t } = useI18n();
  const [manifest, setManifest] = useState<PrivacyManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPrivacyManifest()
      .then((result) => {
        if (!cancelled) setManifest(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="container-page py-12 sm:py-16">
        <div className="max-w-3xl">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck aria-hidden className="size-6" />
          </div>
          <h1 className="mt-6 text-[clamp(2.5rem,5.5vw,4rem)] font-extrabold leading-[1.02]">
            {t("privacy.title")}
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted">{t("privacy.intro")}</p>
        </div>

        {loading ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : error || !manifest ? (
          <div className="mt-10">
            <ErrorState
              title={t("privacy.unavailable")}
              body={t("errors.network")}
              action={
                <a
                  href={`${API_URL}/api/v1/privacy/manifest`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
                >
                  {t("common.retry")}
                </a>
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary-soft/40 p-4 text-sm leading-6">
              <span className="font-bold">{manifest.summary}</span>
              <span className="ml-2 text-muted">{t("privacy.source")}</span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <ListBlock
                title={t("privacy.notCollected")}
                items={manifest.not_collected}
                icon={<LockKeyhole aria-hidden className="size-5" />}
              />
              <ListBlock
                title={t("privacy.limitations")}
                items={manifest.privacy_limitations}
                icon={<Users aria-hidden className="size-5" />}
              />
              <ListBlock
                title={t("privacy.retention")}
                items={manifest.retention}
                icon={<Timer aria-hidden className="size-5" />}
              />
              <ListBlock
                title={t("privacy.verification")}
                items={manifest.verification}
                icon={<ShieldCheck aria-hidden className="size-5" />}
              />
            </div>

            <section className="mt-10">
              <div className="flex items-center gap-2">
                <KeyRound aria-hidden className="size-5 text-primary" />
                <h2 className="text-2xl font-extrabold">{t("privacy.credentials")}</h2>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {manifest.temporary_credentials.map((credential) => (
                  <Card key={credential.name}>
                    <h3 className="font-bold">{credential.name}</h3>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">
                      {credential.lifetime}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-muted">{credential.storage}</p>
                    <p className="mt-3 text-xs leading-5 text-muted">{credential.notes}</p>
                  </Card>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <div className="flex items-center gap-2">
                <Database aria-hidden className="size-5 text-primary" />
                <h2 className="text-2xl font-extrabold">{t("privacy.collected")}</h2>
              </div>
              <p className="mt-2 text-sm text-muted">{t("privacy.source")}</p>
              <div className="mt-4 space-y-2">
                {manifest.tables.map((table) => (
                  <details
                    key={table.name}
                    className="rounded-2xl border border-border bg-surface px-5 py-4"
                  >
                    <summary className="cursor-pointer font-semibold">
                      <span className="font-mono text-sm text-primary">{table.name}</span>
                      <span className="ml-3 text-sm font-normal text-muted">
                        {table.purpose}
                      </span>
                    </summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-muted">
                          <tr>
                            <th className="py-1 pr-4 font-semibold">Column</th>
                            <th className="py-1 pr-4 font-semibold">Type</th>
                            <th className="py-1 font-semibold">Nullable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((column) => (
                            <tr key={column.name} className="border-t border-border/70">
                              <td className="py-1.5 pr-4 font-mono">{column.name}</td>
                              <td className="py-1.5 pr-4">{column.type}</td>
                              <td className="py-1.5">{column.nullable ? "yes" : "no"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <p className="mt-8 text-xs text-muted">
              Manifest version {manifest.version} · allowlisted personal field(s):{" "}
              {(manifest.allowlisted_personal_fields ?? []).join(", ")}.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
