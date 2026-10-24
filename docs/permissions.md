# Roles and permissions

## How it works today

The brief has two kinds of people: **members** and **admins**. The roster
marks admins with `admin = yes`, stored as the boolean `users.is_admin`.

Code never asks "is this an admin?". It asks "may this user do X?":

| Permission          | Lets the user…                                          | Today |
|---------------------|---------------------------------------------------------|-------|
| `team.view`         | see org analytics, any member's history, all meetings   | admin |
| `attendance.record` | record or fix attendance for anyone                     | admin |
| `hours.manage`      | view and edit anyone's hour logs                        | admin |
| `members.manage`    | change a member's tier, weekly quota and role           | admin |
| `calendar.sync`     | trigger a Google Calendar sync by hand                  | admin |

Everyone can always manage their **own** hours, clock in to their **own**
meetings and see their **own** history; that needs no permission.

The role → permissions table lives in three places, deliberately small:

1. **Server checks**: `app/internal/team/permissions.go`. `RoleOf(user)` gives
   the role, `Can(user, perm)` answers, `requirePerm(perm, handler)` guards a
   route. This is the source of truth.
2. **Database rules**: `permRule(perm)` in
   `app/migrations/1786000000_create_team_collections.go`. It builds the
   PocketBase API rule for direct collection access (attendance, hour_logs,
   users).
3. **UI**: `app/frontend/src/lib/permissions.ts`. `can(perm)` only hides
   buttons and pages; the server refuses anyway.

Project boards keep their own per-project roles from workavera
(`admin` / `member` / `viewer` in `board_project_members`). Those are separate
and unaffected.

## Adding a role that is a different mix of the same permissions

Example: a **coordinator** who records attendance but sees no hours.

1. Add the role to the users collection: a new migration that adds a select
   field `role` (`member`, `coordinator`, `admin`) and copies `is_admin` into
   it.
2. `permissions.go`: add `"coordinator": {PermAttendanceRecord}` and make
   `RoleOf` read the `role` field.
3. `permissions.ts`: the same two lines.
4. In the same migration, rewrite the rules with a new `permRule` that maps a
   permission to the roles holding it, for example
   `@request.auth.role = "admin" || @request.auth.role = "coordinator"`.

No handler, page or query changes. About 30 minutes.

## Adding a new permission

Add the constant in `permissions.go` and `permissions.ts`, grant it to roles,
and guard the new route with `requirePerm(...)` or the UI with `can(...)`.

## When roles should become data

If the team wants to create roles **without a deploy**, move the table into
the database: a `roles` collection with a multi-select `permissions` field,
and `users.role` as a relation to it. Then:

- `RoleOf`/`Can` read `user.expand.role.permissions`,
- `permRule(p)` becomes `@request.auth.role.permissions ?= "p"`,
- roles are edited in the PocketBase admin panel (`/_/`).

Again, nothing outside these three places changes. We did not do this yet
because the team has two roles and judging rewards working features over
flexibility nobody asked for.
