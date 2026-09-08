import Link from 'next/link';
import type { ClubOperations as Model, ManagedSquad } from '@/lib/club-operations-query.ts';
import { OperationsForm, OperationNotice, type OperationAction } from './OperationsForm.tsx';

const fieldClass =
  'border-navy bg-surface mt-2 block w-full max-w-md rounded border px-3 py-2 text-sm';
const linkClass = 'text-sm font-bold underline underline-offset-4 hover:text-navy';
const namingGuidance =
  'Use a short, neutral name, such as Cedar or North. Avoid labels about riders’ ability or behavior.';
function OperationFields({ kind, squadId }: { kind: string; squadId?: number }) {
  return (
    <>
      <input type="hidden" name="operation" value={kind} />
      {squadId ? <input type="hidden" name="squadId" value={squadId} /> : null}
    </>
  );
}

function SquadEditor({
  squad,
  model,
  action,
}: {
  squad: ManagedSquad;
  model: Model;
  action: OperationAction;
}) {
  return (
    <details className="mt-3">
      <summary className="w-fit cursor-pointer text-sm font-bold underline underline-offset-4">
        Manage {squad.name}
      </summary>
      <div className="border-border mt-4 space-y-7 border-l pl-4 sm:pl-6">
        <OperationsForm action={action} submitLabel="Save name">
          <OperationFields kind="rename" squadId={squad.id} />
          <label className="block text-sm font-bold" htmlFor={`name-${squad.id}`}>
            Squad name
          </label>
          <input
            id={`name-${squad.id}`}
            name="name"
            required
            maxLength={80}
            defaultValue={squad.name}
            aria-describedby={`naming-${squad.id}`}
            className={fieldClass}
          />
          <p id={`naming-${squad.id}`} className="text-muted max-w-xl text-sm">
            {namingGuidance}
          </p>
        </OperationsForm>
        <OperationsForm action={action} submitLabel="Save roster">
          <OperationFields kind="riders" squadId={squad.id} />
          <fieldset>
            <legend className="text-sm font-bold">Riders in {squad.name}</legend>
            <p className="text-muted mt-1 text-sm">
              Choose from this club’s season roster. Riders may belong to more than one squad.
            </p>
            {model.riders.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {model.riders.map((rider) => (
                  <label key={rider.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="riderId"
                      value={rider.id}
                      defaultChecked={squad.riderIds.includes(rider.id)}
                      className="mt-1 size-4"
                    />
                    {rider.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm">No riders are on this season’s club roster yet.</p>
            )}
          </fieldset>
        </OperationsForm>
        {model.role === 'admin' ? (
          <OperationsForm action={action} submitLabel="Save account assignments">
            <OperationFields kind="accounts" squadId={squad.id} />
            <fieldset>
              <legend className="text-sm font-bold">Assigned club accounts</legend>
              <p className="text-muted mt-1 text-sm">
                Assignments provide squad choices. Assigned coaches can manage this squad; members
                can read it. A saved preference controls the default.
              </p>
              <div className="mt-3 space-y-2">
                {model.accounts
                  .filter((account) => !account.revoked)
                  .map((account) => (
                    <label key={account.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="userId"
                        value={account.id}
                        defaultChecked={squad.accountIds.includes(account.id)}
                        className="mt-1 size-4"
                      />
                      <span className="min-w-0 break-words">
                        {account.name || account.email} · {account.role}
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
          </OperationsForm>
        ) : null}
        <OperationsForm action={action} submitLabel="Archive squad">
          <OperationFields kind="archive" squadId={squad.id} />
          <p className="max-w-xl text-sm">
            Archiving removes this squad from active choices. Its address and current roster remain
            available, and its name and address stay reserved.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4" />
            Archive {squad.name}
          </label>
        </OperationsForm>
      </div>
    </details>
  );
}

export function ClubOperations({
  year,
  clubName,
  model,
  action,
  notice,
}: {
  year: number;
  clubName: string;
  notice?: string;
  model: Model;
  action: OperationAction;
}) {
  const active = model.squads.filter((squad) => !squad.archived);
  const archived = model.squads.filter((squad) => squad.archived);
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header>
        <Link href={`/${year}`} className={linkClass}>
          Back to {year} season
        </Link>
        <h1 className="font-display mt-5 text-4xl tracking-wide uppercase">Club operations</h1>
        <p className="text-muted mt-2 text-sm">
          {clubName} · {year} · {model.role}
        </p>
      </header>
      {notice ? <OperationNotice message={notice} /> : null}
      <section className="border-border mt-8 border-t pt-5" aria-labelledby="preference-heading">
        <h2 id="preference-heading" className="font-display text-2xl tracking-wide uppercase">
          Your squad
        </h2>
        <p className="text-muted mt-2 mb-4 max-w-xl text-sm">
          Choose the squad you want to open from the season page. This preference does not change
          your assignments or access.
        </p>
        <OperationsForm action={action} submitLabel="Save preference">
          <OperationFields kind="preference" />
          <label htmlFor="preferred-squad" className="text-sm font-bold">
            Your squad
          </label>
          <select
            id="preferred-squad"
            name="squadId"
            defaultValue={model.preferredSquadId ?? ''}
            className={fieldClass}
          >
            <option value="">Use my assignment, if there is one</option>
            {active.map((squad) => (
              <option key={squad.id} value={squad.id}>
                {squad.name}
              </option>
            ))}
          </select>
        </OperationsForm>
      </section>
      <section className="border-border mt-8 border-t pt-5" aria-labelledby="squads-heading">
        <h2 id="squads-heading" className="font-display text-2xl tracking-wide uppercase">
          Squads
        </h2>
        {active.length ? (
          <ul className="mt-4 list-none">
            {active.map((squad) => (
              <li key={squad.id} className="border-border border-b py-5 first:pt-0">
                <h3 className="font-display text-xl tracking-wide uppercase">{squad.name}</h3>
                <p className="text-muted mt-1 text-sm">
                  {squad.riderIds.length} {squad.riderIds.length === 1 ? 'rider' : 'riders'}
                </p>
                <Link
                  href={`/${year}/squad/${squad.slug}`}
                  className={`${linkClass} mt-2 inline-block`}
                >
                  Open {squad.name} roster
                </Link>
                {squad.canManage ? (
                  <SquadEditor squad={squad} model={model} action={action} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm">
            No active squads for this season.{' '}
            <Link href={`/${year}/roster`} className={linkClass}>
              Open club roster
            </Link>
          </p>
        )}
        {model.role !== 'member' ? (
          <details className="mt-5">
            <summary className="w-fit cursor-pointer text-sm font-bold underline underline-offset-4">
              Create a squad
            </summary>
            <div className="mt-4">
              <OperationsForm action={action} submitLabel="Create squad">
                <OperationFields kind="create" />
                <label htmlFor="new-squad-name" className="text-sm font-bold">
                  New squad name
                </label>
                <input
                  id="new-squad-name"
                  name="name"
                  required
                  maxLength={80}
                  aria-describedby="new-squad-guidance"
                  className={fieldClass}
                />
                <p id="new-squad-guidance" className="text-muted max-w-xl text-sm">
                  {namingGuidance}
                </p>
              </OperationsForm>
            </div>
          </details>
        ) : null}
        {archived.length ? (
          <details className="mt-6">
            <summary className="w-fit cursor-pointer text-sm font-bold">
              Archived squads ({archived.length})
            </summary>
            <p className="text-muted mt-2 text-sm">
              Read-only current rosters; no historical membership record is implied.
            </p>
            <ul className="mt-3 list-none space-y-2">
              {archived.map((squad) => (
                <li key={squad.id}>
                  <Link href={`/${year}/squad/${squad.slug}`} className={linkClass}>
                    Open archived {squad.name} roster
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {model.role === 'admin' ? (
        <section className="border-border mt-8 border-t pt-5" aria-labelledby="accounts-heading">
          <h2 id="accounts-heading" className="font-display text-2xl tracking-wide uppercase">
            Club accounts
          </h2>
          <p className="text-muted mt-2 max-w-xl text-sm">
            These are adult club accounts, separate from the athlete roster. Keep at least one
            active admin.
          </p>
          <ul className="mt-4 list-none">
            {model.accounts.map((account) => {
              const label = account.name || account.email;
              return (
                <li key={account.id} className="border-border border-b py-5 first:pt-0">
                  <h3 className="text-base font-bold break-words">{label}</h3>
                  {account.name ? (
                    <p className="text-muted text-sm break-all">{account.email}</p>
                  ) : null}
                  <p className="mt-1 text-sm">
                    {account.revoked ? 'Access revoked' : `Current role: ${account.role}`}
                  </p>
                  {!account.revoked ? (
                    <details className="mt-3">
                      <summary className="w-fit cursor-pointer text-sm font-bold underline underline-offset-4">
                        Manage {label}
                      </summary>
                      <div className="border-border mt-4 space-y-6 border-l pl-4">
                        <OperationsForm action={action} submitLabel="Save role">
                          <OperationFields kind="member-role" />
                          <input type="hidden" name="userId" value={account.id} />
                          <label htmlFor={`role-${account.id}`} className="text-sm font-bold">
                            Role for {label}
                          </label>
                          <select
                            id={`role-${account.id}`}
                            name="role"
                            defaultValue={account.role}
                            className={fieldClass}
                          >
                            <option value="member">Member</option>
                            <option value="coach">Coach</option>
                            <option value="admin">Admin</option>
                          </select>
                          <p className="text-muted max-w-xl text-sm">
                            Members read club reporting. Coaches also manage their squads. Admins
                            manage club accounts.
                          </p>
                        </OperationsForm>
                        <OperationsForm action={action} submitLabel="Revoke access">
                          <OperationFields kind="member-revoke" />
                          <input type="hidden" name="userId" value={account.id} />
                          <p className="max-w-xl text-sm">
                            Revocation takes effect on this account’s next protected request. It
                            does not remove athlete results.
                          </p>
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="confirm"
                              value="yes"
                              required
                              className="mt-1 size-4"
                            />
                            Revoke access for {label}
                          </label>
                        </OperationsForm>
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
