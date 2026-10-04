import {
  CreateTodoSchema,
  toFieldErrors,
  type CreateTodoInput,
  type FieldError,
  type TodoView,
} from '@foci/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/ApiError';
import { describeError } from '../../api/describeError';
import { ErrorBanner } from './ErrorBanner';
import styles from './TodoForm.module.css';

export interface TodoFormValues {
  title: string;
  description: string;
  /** Local calendar date, `YYYY-MM-DD`, or empty. */
  dueDate: string;
  /** Local wall-clock time, `HH:MM`, or empty (defaults to 17:00 on submit). */
  dueTime: string;
}

export const DEFAULT_DUE_TIME = '17:00';

export const EMPTY_FORM: TodoFormValues = { title: '', description: '', dueDate: '', dueTime: '' };

export const REAL_DATE_ERROR = 'Enter a real date';

/** The wire fields an edit can change; the date and time inputs together are one `dueAt`. */
export type ChangedField = 'title' | 'description' | 'dueAt';

/** The deadline as one comparable value; a time kept while the date is empty is no deadline. */
const deadlineKey = ({ dueDate, dueTime }: TodoFormValues): string =>
  dueDate === '' ? '' : `${dueDate}T${dueTime === '' ? DEFAULT_DUE_TIME : dueTime}`;

export function changedFields(values: TodoFormValues, start: TodoFormValues): ChangedField[] {
  const changed: ChangedField[] = [];
  if (values.title !== start.title) changed.push('title');
  if (values.description !== start.description) changed.push('description');
  if (deadlineKey(values) !== deadlineKey(start)) changed.push('dueAt');
  return changed;
}

/** After a reload: untouched fields adopt the reloaded values; fields the user edited keep their input. */
export function rebaseValues(
  values: TodoFormValues,
  start: TodoFormValues,
  reloaded: TodoFormValues,
): TodoFormValues {
  const deadlineEdited = deadlineKey(values) !== deadlineKey(start);
  return {
    title: values.title === start.title ? reloaded.title : values.title,
    description:
      values.description === start.description ? reloaded.description : values.description,
    dueDate: deadlineEdited ? values.dueDate : reloaded.dueDate,
    dueTime: deadlineEdited ? values.dueTime : reloaded.dueTime,
  };
}

export function toInput(values: TodoFormValues): CreateTodoInput {
  return {
    title: values.title,
    description: values.description === '' ? null : values.description,
    dueAt: toDueAt(values),
  };
}

/** Whether the entered local date exists; an empty date (no deadline) counts as real. */
function hasRealDate(values: TodoFormValues): boolean {
  if (values.dueDate === '') return true;
  const instant = new Date(deadlineKey(values));
  // Date rolls an impossible day (02-30) over to the next month; only an exact round trip is real.
  return !Number.isNaN(instant.getTime()) && localParts(instant).dueDate === values.dueDate;
}

/** The entered local date and time as a UTC instant; an unparseable entry is passed on raw so the schema rejects it. */
function toDueAt(values: TodoFormValues): string | null {
  if (values.dueDate === '') return null;
  const local = deadlineKey(values);
  return hasRealDate(values) ? new Date(local).toISOString() : local;
}

/** A moment as the viewer's local calendar date (`YYYY-MM-DD`) and wall-clock time (`HH:MM`). */
function localParts(moment: Date): { dueDate: string; dueTime: string } {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return {
    dueDate: `${pad(moment.getFullYear(), 4)}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`,
    dueTime: `${pad(moment.getHours())}:${pad(moment.getMinutes())}`,
  };
}

export function toFormValues(todo: TodoView): TodoFormValues {
  const base = { title: todo.title, description: todo.description ?? '' };
  if (todo.dueAt === null) return { ...base, dueDate: '', dueTime: '' };
  return { ...base, ...localParts(new Date(todo.dueAt)) };
}

interface SplitErrors {
  fields: Record<string, string>;
  general: string | null;
}

/** First message per field; body-level errors (field null) become one general message. */
function splitErrors(errors: FieldError[]): SplitErrors {
  const fields: Record<string, string> = {};
  let general: string | null = null;
  for (const error of errors) {
    if (error.field === null) general ??= error.message;
    else fields[error.field] ??= error.message;
  }
  return { fields, general };
}

interface FieldProps {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error !== undefined && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TodoFormProps {
  initialValues?: TodoFormValues;
  /**
   * The stored deadline behind `initialValues`. The date and time inputs only have minute
   * precision, so while they are untouched this exact instant stands in for a re-derived one during
   * client-side validation; the deadline is then reported unchanged and left out of the PATCH.
   */
  initialDueAt?: string | null;
  /**
   * The version `initialValues` were read from. When it changes (a reload after a 412), the edit is
   * merged with the reloaded values: untouched fields adopt them, edited fields keep the input.
   */
  baseVersion?: number;
  submitLabel: string;
  /** `changed` lists the fields edited since the form started (or was last rebased). */
  onSubmit: (input: CreateTodoInput, changed: readonly ChangedField[]) => Promise<void>;
  onCancel?: () => void;
}

export function TodoForm({
  initialValues = EMPTY_FORM,
  initialDueAt,
  baseVersion,
  submitLabel,
  onSubmit,
  onCancel,
}: TodoFormProps) {
  const id = useId();
  const [values, setValues] = useState(initialValues);
  /** What the form started from; a background refetch must not move it, only a new base version. */
  const [start, setStart] = useState({
    values: initialValues,
    dueAt: initialDueAt,
    version: baseVersion,
  });
  // A new base version (the panel's reload after a 412) merges the reloaded values into the edit.
  if (baseVersion !== start.version) {
    setValues((current) => rebaseValues(current, start.values, initialValues));
    setStart({ values: initialValues, dueAt: initialDueAt, version: baseVersion });
  }
  const [errors, setErrors] = useState<SplitErrors>({ fields: {}, general: null });
  const [submitting, setSubmitting] = useState(false);

  /** The deadline is one `dueAt` field on the wire, entered through the date and time inputs. */
  const errorFor = (name: keyof TodoFormValues) =>
    errors.fields[name] ?? (name === 'dueDate' ? errors.fields.dueAt : undefined);

  const change = (name: keyof TodoFormValues, value: string) =>
    setValues((current) => {
      const next = { ...current, [name]: value };
      // Backspacing a date segment briefly reports '': keep the chosen time.
      // 17:00 is prefilled only if no time was ever chosen.
      if (name === 'dueDate' && value !== '' && current.dueTime === '') {
        next.dueTime = DEFAULT_DUE_TIME;
      }
      return next;
    });

  const fieldProps = (name: keyof TodoFormValues) => {
    const error = errorFor(name);
    return {
      id: `${id}-${name}`,
      value: values[name],
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : `${id}-${name}-error`,
      onChange: (event: { target: { value: string } }) => change(name, event.target.value),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasRealDate(values)) {
      setErrors({ fields: { dueDate: REAL_DATE_ERROR }, general: null });
      return;
    }
    const input = toInput(values);
    const changed = changedFields(values, start.values);
    // An untouched deadline validates as the exact stored instant; `changed` omits it from the PATCH.
    if (!changed.includes('dueAt') && start.dueAt !== undefined) input.dueAt = start.dueAt;
    const parsed = CreateTodoSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(splitErrors(toFieldErrors(parsed.error)));
      return;
    }
    setErrors({ fields: {}, general: null });
    setSubmitting(true);
    try {
      await onSubmit(input, changed);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.errors.length > 0
          ? splitErrors(error.errors)
          : { fields: {}, general: describeError(error) },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {errors.general !== null && <ErrorBanner message={errors.general} />}
      <Field id={`${id}-title`} label="Title" error={errors.fields.title}>
        <input type="text" autoComplete="off" {...fieldProps('title')} />
      </Field>
      <Field id={`${id}-description`} label="Description" error={errors.fields.description}>
        <textarea rows={3} {...fieldProps('description')} />
      </Field>
      <Field id={`${id}-dueDate`} label="Due date" error={errorFor('dueDate')}>
        <input type="date" {...fieldProps('dueDate')} />
      </Field>
      <Field id={`${id}-dueTime`} label="Due time" error={errorFor('dueTime')}>
        <input
          type="time"
          disabled={values.dueDate === ''}
          // Only reachable with a date set (the input is disabled otherwise): show what will be sent.
          onBlur={() => {
            if (values.dueTime === '') change('dueTime', DEFAULT_DUE_TIME);
          }}
          {...fieldProps('dueTime')}
          // While the date is empty the chosen time is kept but not shown (the input is disabled).
          value={values.dueDate === '' ? '' : values.dueTime}
        />
      </Field>
      <div className={styles.buttons}>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
