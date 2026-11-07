import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Nexus collects, uses, and protects your information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const updated = "November 6, 2026";
  return (
    <main className="h-full overflow-y-auto bg-[#0b0c0f] text-white/90">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm font-medium tracking-wide text-white/45">
          <a href={SITE.url} className="hover:text-white">
            Nexus
          </a>
          {" · "}Privacy Policy
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-white/50">Last updated: {updated}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-white/75">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Who we are</h2>
            <p>
              Nexus (“we”, “us”) is a social app for chat, voice and video calls, Live places
              (Wump), music, and related tools operated by qyopy. This policy explains what we
              collect and how we use it when you use Nexus on the web, iPhone, or Android.
            </p>
            <p>
              Contact:{" "}
              <a className="text-white underline decoration-white/30 underline-offset-2" href="mailto:owner@qyopy.hu">
                owner@qyopy.hu
              </a>
              {" · "}
              <a className="text-white underline decoration-white/30 underline-offset-2" href={SITE.url}>
                {SITE.url.replace(/^https?:\/\//, "")}
              </a>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Information we collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-white/90">Account data</span> — email, username, display
                name, password or sign-in provider identifiers, and profile details you choose to
                add (avatar, bio, links).
              </li>
              <li>
                <span className="text-white/90">Messages and content</span> — chats, media, files,
                voice/video call signaling, and content you create in Nexus apps (for example Nexus
                Link pages).
              </li>
              <li>
                <span className="text-white/90">Location (optional)</span> — when you turn on Wump /
                Bump Live, we process location so friends or family you choose can see your pin.
                Sharing stops when you turn Live off. Location may be rounded and time-limited.
              </li>
              <li>
                <span className="text-white/90">Device and diagnostics</span> — device type, app
                version, push notification tokens, crash/performance logs, and basic usage needed
                to run and improve Nexus. Over-the-air update checks (for example Capgo) may run in
                native shells.
              </li>
              <li>
                <span className="text-white/90">Support</span> — messages you send us when you ask
                for help.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">How we use information</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide chat, calls, Live places, music, and other Nexus features</li>
              <li>Authenticate you and keep your account secure</li>
              <li>Send notifications you enable (messages, calls, invites)</li>
              <li>Prevent abuse, spam, and technical issues</li>
              <li>Improve reliability and product quality</li>
              <li>Comply with law and respond to lawful requests</li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Sharing</h2>
            <p>We share data only as needed to operate Nexus, including:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Other users you message, call, or share Live location with</li>
              <li>
                Service providers that host or process data for us (for example cloud database,
                hosting, push delivery, analytics/crash tools, and OTA update services), under
                contracts that limit their use of your data
              </li>
              <li>Authorities when required by law</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Your choices</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Edit profile and privacy settings in the app</li>
              <li>Turn Live location off anytime in Wump</li>
              <li>Control notification permissions in system settings</li>
              <li>
                Request access, correction, or deletion of your account data by emailing{" "}
                <a className="text-white underline decoration-white/30 underline-offset-2" href="mailto:owner@qyopy.hu">
                  owner@qyopy.hu
                </a>
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Retention &amp; security</h2>
            <p>
              We keep account and message data while your account is active and as needed for
              backups, security, and legal obligations. We use industry-standard safeguards; no
              method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Children</h2>
            <p>
              Nexus is not directed to children under 13 (or the minimum age required in your
              country). If you believe a child provided us data, contact us and we will take
              appropriate steps.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">International transfers</h2>
            <p>
              We may process data in the EU and other countries where our providers operate.
              Where required, we use appropriate safeguards for cross-border transfers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Changes</h2>
            <p>
              We may update this policy. We will post the new version on this page and update the
              “Last updated” date. Continued use of Nexus after changes means you accept the
              updated policy.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
