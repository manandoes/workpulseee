"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { has } from "@/lib/permissions";
import {
  ASSIGNABLE_LEVELS,
  canHoldPower,
  LEVEL_DEFAULTS,
  LEVEL_LABELS,
  POWER_GROUPS,
  POWERS,
  type Level,
} from "@/lib/permission-grants";
import type {
  CompanyRole,
  GrantedPermission,
  PermissionChangeKind,
} from "@/lib/generated/prisma/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTime } from "@/components/ui/date-time";

type Person = {
  kind: "employee" | "account";
  id: string;
  fullName: string;
  detail: string;
  level: Level;
  grants: GrantedPermission[];
  revokes: GrantedPermission[];
};

type HistoryEntry = {
  id: string;
  kind: PermissionChangeKind;
  permission: GrantedPermission | null;
  fromRole: CompanyRole | null;
  toRole: CompanyRole | null;
  changedByName: string | null;
  createdAt: string;
};

const keyOf = (person: { kind: string; id: string }) =>
  `${person.kind}:${person.id}`;

const powerLabel = (permission: GrantedPermission | null) =>
  POWERS.find((power) => power.value === permission)?.label ?? "a power";

/** A person as `has` reads them — the same rule the server enforces. */
function holderOf(person: Person) {
  return {
    accountType:
      person.kind === "employee" ? ("employee" as const) : ("company" as const),
    role: person.level,
    grants: person.grants,
    revokes: person.revokes,
  };
}

/**
 * The override set after switching `permission` — mirrors `setPower` in
 * lib/permission-grants-data.ts, so the optimistic update shows exactly what
 * the server will store: nothing when the wanted state is the level default.
 */
function withPower(
  person: Person,
  permission: GrantedPermission,
  enabled: boolean
): Person {
  const grants = person.grants.filter((value) => value !== permission);
  const revokes = person.revokes.filter((value) => value !== permission);
  if (LEVEL_DEFAULTS[person.level].includes(permission) !== enabled) {
    (enabled ? grants : revokes).push(permission);
  }
  return { ...person, grants, revokes };
}

function describeChange(entry: HistoryEntry): string {
  switch (entry.kind) {
    case "PowerOn":
      return `switched on ${powerLabel(entry.permission)}`;
    case "PowerOff":
      return `switched off ${powerLabel(entry.permission)}`;
    case "Reset":
      return "reset every switch to the level's defaults";
    case "LevelChanged":
      return `changed the level from ${
        entry.fromRole ? LEVEL_LABELS[entry.fromRole] : "?"
      } to ${entry.toRole ? LEVEL_LABELS[entry.toRole] : "?"}`;
  }
}

/**
 * The Owner's Authority page (Plan: access levels): pick anyone — company
 * login or employee — and see every power as a switch showing what they can
 * actually do right now. Flipping one saves immediately and applies on that
 * person's next click (the server reads overrides fresh per request); a
 * switch that differs from their level's default is tagged Custom.
 *
 * Every rule here is a preview of the server's own (`has`, `setPower`) — the
 * routes re-check all of it.
 */
export function AuthorityPanel() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [history, setHistory] = useState<{
    key: string;
    entries: HistoryEntry[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/permission-grants")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body) setPeople(body.people);
        else toast.error("Could not load people. Please refresh.");
      });
  }, []);

  const selected = people?.find((person) => keyOf(person) === selectedKey);
  const selectedKind = selected?.kind;
  const selectedId = selected?.id;
  // Bumped after every saved change, so the history refetches with it.
  const historyKey = selected ? `${keyOf(selected)}#${historyVersion}` : null;

  useEffect(() => {
    if (!selectedKind || !selectedId || !historyKey) return;
    let cancelled = false;
    const params = new URLSearchParams({ kind: selectedKind, id: selectedId });
    fetch(`/api/permission-grants/history?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) {
          setHistory({ key: historyKey, entries: body?.history ?? [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKind, selectedId, historyKey]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (people ?? []).filter(
      (person) =>
        !needle ||
        person.fullName.toLowerCase().includes(needle) ||
        person.detail.toLowerCase().includes(needle) ||
        LEVEL_LABELS[person.level].toLowerCase().includes(needle)
    );
  }, [people, query]);

  function replacePerson(next: Person) {
    setPeople(
      (rows) =>
        rows?.map((row) => (keyOf(row) === keyOf(next) ? next : row)) ?? null
    );
  }

  async function send(url: string, init: RequestInit): Promise<boolean> {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    if (response.ok) return true;
    const body = await response.json().catch(() => null);
    toast.error(body?.error ?? "Could not save that. Please try again.");
    return false;
  }

  async function switchPower(
    person: Person,
    permission: GrantedPermission,
    enabled: boolean
  ) {
    setPending(permission);
    replacePerson(withPower(person, permission, enabled));
    const saved = await send("/api/permission-grants", {
      method: "POST",
      body: JSON.stringify({
        subject: { kind: person.kind, id: person.id },
        permission,
        enabled,
      }),
    });
    setPending(null);
    if (!saved) {
      replacePerson(person);
      return;
    }
    setHistoryVersion((version) => version + 1);
  }

  async function resetPerson(person: Person) {
    setPending("reset");
    const saved = await send("/api/permission-grants/reset", {
      method: "POST",
      body: JSON.stringify({ subject: { kind: person.kind, id: person.id } }),
    });
    setPending(null);
    if (!saved) return;
    replacePerson({ ...person, grants: [], revokes: [] });
    setHistoryVersion((version) => version + 1);
    toast.success(
      `${person.fullName} now follows the ${LEVEL_LABELS[person.level]} defaults.`
    );
  }

  async function changeLevel(person: Person, level: Level) {
    const customCount = person.grants.length + person.revokes.length;
    if (
      customCount > 0 &&
      !window.confirm(
        `Moving ${person.fullName} to ${LEVEL_LABELS[level]} clears their ${customCount} custom switch${customCount === 1 ? "" : "es"}. Continue?`
      )
    ) {
      return;
    }
    setPending("level");
    const saved = await send(`/api/company-accounts/${person.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: level }),
    });
    setPending(null);
    if (!saved) return;
    replacePerson({ ...person, level, grants: [], revokes: [] });
    setHistoryVersion((version) => version + 1);
    toast.success(`${person.fullName} is now ${LEVEL_LABELS[level]}.`);
  }

  if (people === null) {
    return <p className="text-text-secondary">Loading…</p>;
  }

  const logins = visible.filter((person) => person.kind === "account");
  const employees = visible.filter((person) => person.kind === "employee");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <Card>
        <CardContent className="flex flex-col gap-3 py-2">
          <label className="relative block">
            <span className="sr-only">Search people</span>
            <Search
              aria-hidden
              className="text-text-secondary pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              strokeWidth={1.5}
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email or level"
              className="pl-8"
            />
          </label>
          <div className="flex max-h-128 flex-col gap-4 overflow-y-auto">
            <PeopleGroup
              title="Company logins"
              people={logins}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
            <PeopleGroup
              title="Employees"
              people={employees}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
            {visible.length === 0 ? (
              <p className="text-text-secondary text-meta">
                Nobody matches that search.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <PersonPowers
          key={keyOf(selected)}
          person={selected}
          pending={pending}
          history={history?.key === historyKey ? history.entries : null}
          onSwitch={(permission, enabled) =>
            switchPower(selected, permission, enabled)
          }
          onReset={() => resetPerson(selected)}
          onChangeLevel={(level) => changeLevel(selected, level)}
        />
      ) : (
        <Card>
          <CardContent className="py-2">
            <p className="text-text-secondary">
              Pick someone to see — and change — exactly what they can access.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PeopleGroup({
  title,
  people,
  selectedKey,
  onSelect,
}: {
  title: string;
  people: Person[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (people.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-text-secondary text-meta font-medium">{title}</h3>
      <ul className="flex flex-col">
        {people.map((person) => {
          const key = keyOf(person);
          const customCount = person.grants.length + person.revokes.length;
          const isSelected = key === selectedKey;
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                  isSelected
                    ? "bg-brand-yellow-light"
                    : "hover:bg-surface-muted"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {person.fullName}
                  </span>
                  <span className="text-text-secondary text-meta block truncate">
                    {LEVEL_LABELS[person.level]}
                    {customCount > 0 ? ` · ${customCount} custom` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PersonPowers({
  person,
  pending,
  history,
  onSwitch,
  onReset,
  onChangeLevel,
}: {
  person: Person;
  pending: string | null;
  history: HistoryEntry[] | null;
  onSwitch: (permission: GrantedPermission, enabled: boolean) => void;
  onReset: () => void;
  onChangeLevel: (level: Level) => void;
}) {
  const isOwner = person.kind === "account" && person.level === "Owner";
  const holder = holderOf(person);
  const customCount = person.grants.length + person.revokes.length;
  const busy = pending !== null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-h3 text-brand-brown font-semibold">
              {person.fullName}
            </h2>
            <p className="text-text-secondary text-meta truncate">
              {person.detail}
            </p>
          </div>
          {person.kind === "account" && !isOwner ? (
            <label className="flex flex-col gap-1">
              <span className="text-text-secondary text-meta">Level</span>
              <select
                value={person.level}
                disabled={busy}
                onChange={(event) => onChangeLevel(event.target.value as Level)}
                className="border-input bg-surface text-foreground h-9 rounded-lg border px-3"
              >
                {ASSIGNABLE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="bg-brand-yellow-light text-brand-brown text-meta inline-flex items-center rounded-full px-2.5 py-1 font-medium">
              {LEVEL_LABELS[person.level]}
            </span>
          )}
        </div>

        {isOwner ? (
          <p className="text-text-secondary flex items-center gap-2">
            <Lock aria-hidden className="size-4" strokeWidth={1.5} />
            The Owner always has every power, including billing, branding, email
            delivery and this page — none of it can be switched off.
          </p>
        ) : (
          <>
            {POWER_GROUPS.map((group) => (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="text-foreground font-semibold">{group}</h3>
                <ul className="divide-border divide-y">
                  {POWERS.filter((power) => power.group === group).map(
                    (power) => {
                      const holdable = canHoldPower(
                        holder.accountType,
                        power.value
                      );
                      const enabled = has(holder, power.value);
                      const custom =
                        person.grants.includes(power.value) ||
                        person.revokes.includes(power.value);
                      return (
                        <li
                          key={power.value}
                          className="flex items-start justify-between gap-4 py-3"
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-foreground flex flex-wrap items-center gap-2 text-sm font-medium">
                              {power.label}
                              {custom ? (
                                <span className="bg-brand-yellow-light text-brand-brown rounded-full px-2 py-0.5 text-xs font-medium">
                                  Custom
                                </span>
                              ) : null}
                            </span>
                            <span className="text-text-secondary text-meta">
                              {holdable
                                ? power.description
                                : "Needs a Manager or HR login — an employee login can't hold this."}
                            </span>
                          </div>
                          <PowerSwitch
                            label={`${power.label} for ${person.fullName}`}
                            checked={enabled}
                            disabled={!holdable || busy}
                            onChange={(next) => onSwitch(power.value, next)}
                          />
                        </li>
                      );
                    }
                  )}
                </ul>
              </section>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-text-secondary text-meta">
                {customCount === 0
                  ? `Following the ${LEVEL_LABELS[person.level]} defaults.`
                  : `${customCount} switch${customCount === 1 ? "" : "es"} differ from the ${LEVEL_LABELS[person.level]} defaults.`}
              </p>
              {customCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onReset}
                >
                  <RotateCcw aria-hidden />
                  Reset to level defaults
                </Button>
              ) : null}
            </div>
          </>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-foreground font-semibold">History</h3>
          {history === null ? (
            <p className="text-text-secondary text-meta">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-text-secondary text-meta">
              No changes yet — they follow their level exactly.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {history.map((entry) => (
                <li key={entry.id} className="text-meta">
                  <span className="text-foreground">
                    {entry.changedByName ?? "A removed login"}{" "}
                    {describeChange(entry)}
                  </span>{" "}
                  <span className="text-text-secondary">
                    · <DateTime value={entry.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function PowerSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-visible:ring-ring/50 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-brand-yellow border-brand-yellow"
          : "bg-surface-muted border-border"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "bg-surface inline-block size-4 rounded-full shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
