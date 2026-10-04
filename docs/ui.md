# UI

FociToDo is a single page: a header, the filter and sort controls, and the task list. Creating, viewing, editing and deleting a task happen in one dialog; completing it is the checkbox on its row. These wireframes show each screen state.

**Notation:** each box is one element of the screen; `[ ]` an input (with its value, if any); `▾` a select showing its current value; `☐` / `☑` a row's checkbox (unticked / ticked); `×` closes the dialog.

The companion review repository's storyboard, [FociToDo-review](https://github.com/charlesmalo/FociToDo-review), shows the running app beside each wireframe.

## Task list — loading

While the first list request is in flight.

![Task list — loading (wireframe)](diagrams/ui/task-list-loading.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show: All ▾ · Sort by: Created ▾ · Order: Descending ▾"]:3
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
  filters["Show: All ▾ · Sort by: Created ▾ · Order: Descending ▾"]:3
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
  filters["Show: All ▾ · Sort by: Created ▾ · Order: Descending ▾"]:3
  row1["☐ Buy oat milk · Due Jan 15, 2030, 5:00 PM"]:3
  row2["☐ File taxes · OVERDUE · Due Apr 30, 2026, 5:00 PM"]:3
  row3["☐ Send invoice · DUE SOON · Due Oct 4, 2026, 9:00 AM"]:3
  row4["☑ Call the bank (completed, struck through)"]:3
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
  filters["Show: Overdue ▾ · Sort by: Created ▾ · Order: Descending ▾"]:3
  none["No tasks match this filter."]:3
```

</details>

## Task list — load error

After the list request fails; Retry sends it again.

![Task list — load error (wireframe)](diagrams/ui/task-list-load-error.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 3
  title["FociToDo"]:2 newtask["+ New task"]
  filters["Show: All ▾ · Sort by: Created ▾ · Order: Descending ▾"]:3
  error["Could not reach the server. Check your connection and try again."]:2 retry["Retry"]
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
  columns 2
  heading["New task"] close["×"]
  titlefield["Title [ ]"]:2
  description["Description [ ]"]:2
  due["Due date [yyyy-mm-dd] · Due time [--:--]"]:2
  space add["Add task"]
```

</details>

## Dialog — new task with errors

After Add task is submitted with the title left empty.

![Dialog — new task with errors (wireframe)](diagrams/ui/dialog-new-task-with-errors.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 2
  heading["New task"] close["×"]
  titlefield["Title [ ]"]:2
  titleerror["Title is required"]:2
  description["Description [ ]"]:2
  due["Due date [yyyy-mm-dd] · Due time [--:--]"]:2
  space add["Add task"]
```

</details>

## Dialog — task details

After a task is opened from the list and its details load; this task is overdue.

![Dialog — task details (wireframe)](diagrams/ui/dialog-task-details.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 2
  heading["Task details"] close["×"]
  t["Title · File taxes"]:2
  d["Description · Receipts in the blue folder"]:2
  due["Due · Apr 30, 2026, 5:00 PM Overdue"]:2
  s["Status · Not completed"]:2
  c["Created · local date and time"]:2
  edit["Edit"] delete["Delete"]
```

</details>

## Dialog — edit task

After Edit is clicked in task details, the form prefilled with the task's current values.

![Dialog — edit task (wireframe)](diagrams/ui/dialog-edit-task.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 2
  heading["Edit task"] close["×"]
  titlefield["Title [File taxes]"]:2
  description["Description [Receipts in the blue folder]"]:2
  due["Due date [2026-04-30] · Due time [17:00]"]:2
  cancel["Cancel"] save["Save"]
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
  fields["Title · Description · Due · Status · Created"]:3
  confirm["Delete this task?"] yes["Yes, delete"] cancel["Cancel"]
```

</details>

## Dialog — changed elsewhere

After Save is rejected because someone else changed the task (HTTP 412).

![Dialog — changed elsewhere (wireframe)](diagrams/ui/dialog-changed-elsewhere.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 2
  heading["Edit task"] close["×"]
  notice["This task was changed elsewhere and has been reloaded.<br/>Your edits are kept — review and save again."]:2
  titlefield["Title [my edited title]"]:2
  description["Description [ ]"]:2
  due["Due date [yyyy-mm-dd] · Due time [--:--]"]:2
  cancel["Cancel"] save["Save"]
```

</details>

## Dialog — task no longer exists

When a task opened from the list was deleted elsewhere (HTTP 404).

![Dialog — task no longer exists (wireframe)](diagrams/ui/dialog-task-no-longer-exists.svg)

<details><summary>Mermaid source</summary>

```mermaid
block-beta
  columns 2
  heading["Task details"] close["×"]
  gone["This task no longer exists."]:2
```

</details>
