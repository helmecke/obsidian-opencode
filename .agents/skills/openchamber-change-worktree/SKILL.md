---
name: openchamber-change-worktree
description: Run an OpenSpec change in its own git worktree in OpenChamber. Use when creating, applying, verifying, or archiving a change, when the user mentions a change worktree, or when an OpenSpec run needs its branch checked out. Requires the OpenChamber session tools; other clients skip it.
---

# OpenChamber change worktree

One worktree per change, named after the change id, on branch `openspec/<change-id>`. It lives from the plan run through the merge, and the plan-PR steps in `openspec/config.yaml` run inside it.

## Availability

This skill drives `session.moveToWorktree` and `session.create`, and uses the directory they return. When the OpenChamber session tools are unavailable, continue with the client's normal OpenSpec flow in the main checkout.

## Start a change

1. Settle the change id first: lowercase words joined by hyphens (`send-on-enter`). It names the worktree folder, the branch, and `openspec/changes/<id>/`.
2. Require a clean checkout: `git status --porcelain` prints nothing. Uncommitted work is not carried; stop and ask what to do with it.
3. Create and enter the worktree with `session.moveToWorktree`:

   ```
   worktree: "<id>"
   branch: "openspec/<id>"
   startRef: "origin/master"
   ```

   The call moves this session into the new worktree and returns its path. Confirm that `git worktree list` shows `openspec/<id>` at that path.
4. Run `openspec new change <id>` in the worktree and write the artifacts there.
5. Run `npm ci` once before the first `npm test`, `npm run build`, or `npm run lint`: a fresh worktree has no `node_modules`.
6. Commit, push, and open the draft plan PR from the worktree branch, as `openspec/config.yaml` says.

The start is done when the worktree holds the change directory, the branch is checked out, and the plan PR is open.

## Apply, verify, archive

Run these in the same worktree, from a session whose directory is that path.

1. Find it with `git worktree list`: the path whose branch is `openspec/<change-id>`.
2. Keep the run inside the worktree. When the request arrives in a session outside it, create the session at that directory with `session.create` and `directory: "<path>"`, give it the apply task as its prompt, and continue there.
3. If no worktree matches and the branch is unmerged, recreate the worktree from `openspec/<change-id>`, say so, and continue. If the branch is merged, the change is finished: stop and report.
4. Run `npm ci` when `node_modules` is missing.

## Finish

Leave the worktree in place. End the run with its path and the cleanup: `git worktree remove <path>`, or OpenChamber's remove action, after the merge.
