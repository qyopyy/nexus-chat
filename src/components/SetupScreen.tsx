export default function SetupScreen() {
  return (
    <div className="grid h-full place-items-center bg-rail p-6">
      <div className="max-w-lg rounded-2xl bg-side p-8 shadow-2xl">
        <h1 className="mb-2 text-2xl font-bold">Almost there</h1>
        <p className="mb-4 text-sub">Nexus needs a Supabase project for accounts, chat and call signaling.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-txt">
          <li>Create a free project at supabase.com.</li>
          <li>
            Open <b>SQL Editor</b>, paste <code className="rounded bg-panel px-1">supabase/schema.sql</code> and run it.
          </li>
          <li>
            Copy <code className="rounded bg-panel px-1">.env.local.example</code> to{" "}
            <code className="rounded bg-panel px-1">.env.local</code> and fill in the URL + anon key.
          </li>
          <li>Restart <code className="rounded bg-panel px-1">npm run dev</code>.</li>
        </ol>
      </div>
    </div>
  );
}
