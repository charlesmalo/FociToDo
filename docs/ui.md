# UI

FociToDo is a single page: a header, the filter and sort controls, and the task list. Creating, viewing, editing and deleting a task happen in one dialog; completing it is the checkbox on its row. These wireframes show each screen state's layout, elements and wording; they are deliberately low-fidelity. For the real look, see the generated screenshots in [`images/`](images/) — [the task list](images/screenshot.png) and [the edit dialog](images/edit-dialog.png).

**Notation:** each box is one element of the screen; `[ ]` an input (with its value, if any); `▾` a select showing its current value; `☐` / `☑` a row's checkbox (unticked / ticked); `×` closes the dialog.

## Task list — loading

While the first list request is in flight.

![Task list — loading (wireframe)](diagrams/ui/task-list-loading.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [All ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  loading["Loading tasks…"]:3
```

</details>

## Task list — empty

After the list request succeeds with no tasks and the filter is All.

![Task list — empty (wireframe)](diagrams/ui/task-list-empty.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [All ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  empty["No tasks yet. Add your first one."]:3
```

</details>

## Task list — with tasks

After the list request succeeds with tasks, including one overdue, one due soon and one completed.

![Task list — with tasks (wireframe)](diagrams/ui/task-list-with-tasks.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [All ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  r1t["☐ Buy oat milk"]:2 r1d["Due Jan 15, 2030, 5:00 PM"]
  r2t["☐ File taxes"]:2 r2d["OVERDUE · Due Apr 30, 2026, 5:00 PM"]
  r3t["☐ Send invoice"]:2 r3d["DUE SOON · Due Oct 4, 2026, 9:00 AM"]
  r4t["☑ Call the bank (struck through, muted)"]:2 r4d["Due Oct 2, 2026, 12:00 PM"]
```

</details>

## Task list — no match

After the list request succeeds with no tasks matching a filter other than All.

![Task list — no match (wireframe)](diagrams/ui/task-list-no-match.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [Overdue ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  none["No tasks match this filter."]:3
```

</details>

## Task list — load error

When the first list request fails there is nothing to show yet; Retry sends it again.

![Task list — load error (wireframe)](diagrams/ui/task-list-load-error.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [All ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  error["Could not reach the server. Check your connection and try again."]:2 retry["Retry"]
```

</details>

## Task list — refresh failed

When a background refresh fails after the tasks have loaded: the rows stay on screen with the notice and Retry above them; the notice clears on the next successful refresh.

![Task list — refresh failed (wireframe)](diagrams/ui/task-list-refresh-failed.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show [All ▾] · Sort by [Created ▾] · Order [Descending ▾]"]:3
  error["Could not reach the server. Check your connection and try again."]:2 retry["Retry"]
  r1t["☐ Buy oat milk"]:2 r1d["Due Jan 15, 2030, 5:00 PM"]
  r2t["☐ File taxes"]:2 r2d["OVERDUE · Due Apr 30, 2026, 5:00 PM"]
  r3t["☐ Send invoice"]:2 r3d["DUE SOON · Due Oct 4, 2026, 9:00 AM"]
  r4t["☑ Call the bank (struck through, muted)"]:2 r4d["Due Oct 2, 2026, 12:00 PM"]
```

</details>

## Filters and sorting

Rendered above the task list in every list state, shown here with each select's options expanded.

![Filters and sorting (wireframe)](diagrams/ui/filters-and-sorting.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  show["Show ▾<br/>All · Completed · Incomplete · Overdue · Due soon"]
  sort["Sort by ▾<br/>Created · Due · Title"]
  order["Order ▾<br/>Ascending · Descending"]
```

</details>

## Dialog — new task

After + New task is clicked, before anything is typed.

![Dialog — new task (wireframe)](diagrams/ui/dialog-new-task.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["New task"]:2 close["×"]
  titlefield["Title<br/>[  ]"]:3
  description["Description<br/>[  ]"]:3
  duedate["Due date<br/>[ mm/dd/yyyy ]"]:3
  duetime["Due time<br/>[ --:-- (disabled until a date is set) ]"]:3
  space:2 add["Add task"]
```

</details>

## Dialog — new task with errors

After Add task is submitted with the title left empty.

![Dialog — new task with errors (wireframe)](diagrams/ui/dialog-new-task-with-errors.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["New task"]:2 close["×"]
  titlefield["Title<br/>[  ]"]:3
  titleerror["Title is required"]:3
  description["Description<br/>[  ]"]:3
  duedate["Due date<br/>[ mm/dd/yyyy ]"]:3
  duetime["Due time<br/>[ --:-- (disabled until a date is set) ]"]:3
  space:2 add["Add task"]
```

</details>

## Dialog — task details

After a task is opened from the list and its details load; this task is overdue. If a background refresh fails, the details (or the edit form, with any typed changes) stay on screen with a notice above them.

![Dialog — task details (wireframe)](diagrams/ui/dialog-task-details.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Task details"]:2 close["×"]
  tl["Title"] tv["File taxes"]:2
  dl["Description"] dv["Receipts in the blue folder"]:2
  ul["Due"] uv["Apr 30, 2026, 5:00 PM Overdue"]:2
  sl["Status"] sv["Not completed"]:2
  cl["Created"] cv["Sep 30, 2026, 12:00 PM"]:2
  space edit["Edit"] delete["Delete"]
```

</details>

## Dialog — edit task

After Edit is clicked in task details, the form prefilled with the task's current values.

![Dialog — edit task (wireframe)](diagrams/ui/dialog-edit-task.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Edit task"]:2 close["×"]
  titlefield["Title<br/>[ File taxes ]"]:3
  description["Description<br/>[ Receipts in the blue folder ]"]:3
  duedate["Due date<br/>[ 04/30/2026 ]"]:3
  duetime["Due time<br/>[ 05:00 PM ]"]:3
  space cancel["Cancel"] save["Save"]
```

</details>

The same dialog in the app, generated from the built web app by the screenshots command:

![Editing a task: due date and time](images/edit-dialog.png)

## Dialog — delete confirmation

After Delete is clicked in task details, before the deletion is confirmed.

![Dialog — delete confirmation (wireframe)](diagrams/ui/dialog-delete-confirmation.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Task details"]:2 close["×"]
  tl["Title"] tv["File taxes"]:2
  dl["Description"] dv["Receipts in the blue folder"]:2
  ul["Due"] uv["Apr 30, 2026, 5:00 PM Overdue"]:2
  sl["Status"] sv["Not completed"]:2
  cl["Created"] cv["Sep 30, 2026, 12:00 PM"]:2
  confirm["Delete this task?"] yes["Yes, delete"] cancel["Cancel"]
```

</details>

## Dialog — changed elsewhere

After Save is rejected because someone else changed the task (HTTP 412): the task is reloaded, the fields the user edited keep their edits, and the others show the reloaded values.

![Dialog — changed elsewhere (wireframe)](diagrams/ui/dialog-changed-elsewhere.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Edit task"]:2 close["×"]
  notice["This task was changed elsewhere and has been reloaded.<br/>Your edits are kept — review and save again."]:3
  titlefield["Title<br/>[ my edited title ]"]:3
  description["Description<br/>[ other writer's description ]"]:3
  duedate["Due date<br/>[ 04/30/2026 ]"]:3
  duetime["Due time<br/>[ 05:00 PM ]"]:3
  space cancel["Cancel"] save["Save"]
```

</details>

## Dialog — refresh failed

When a background refresh of an open task fails: the details or the edit form stay on screen, typed changes kept, with the notice above them; the notice clears on the next successful refresh.

![Dialog — refresh failed (wireframe)](diagrams/ui/dialog-refresh-failed.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Edit task"]:2 close["×"]
  notice["Could not reach the server. Check your connection and try again."]:3
  titlefield["Title<br/>[ File taxes ]"]:3
  description["Description<br/>[ Receipts in the red folder (typed, not saved yet) ]"]:3
  duedate["Due date<br/>[ 04/30/2026 ]"]:3
  duetime["Due time<br/>[ 05:00 PM ]"]:3
  space cancel["Cancel"] save["Save"]
```

</details>

## Dialog — task no longer exists

When a task opened from the list was deleted elsewhere (HTTP 404).

![Dialog — task no longer exists (wireframe)](diagrams/ui/dialog-task-no-longer-exists.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  heading["Task details"]:2 close["×"]
  gone["This task no longer exists."]:3
```

</details>
