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

export function toInput(values: TodoFormValues): CreateTodoInput {
  return {
    title: values.title,
    description: values.description === '' ? null : values.description,
    dueAt: toDueAt(values),
  };
}

/** The entered local date and time as a UTC instant; an unparseable entry is passed on raw so the schema rejects it. */
function toDueAt({ dueDate, dueTime }: TodoFormValues): string | null {
  if (dueDate === '') return null;
  const local = `${dueDate}T${dueTime === '' ? DEFAULT_DUE_TIME : dueTime}`;
  const instant = new Date(local);
  // Date rolls an impossible day (02-30) over to the next month; only an exact round trip is real.
  const real = !Number.isNaN(instant.getTime()) && localParts(instant).dueDate === dueDate;
  return real ? instant.toISOString() : local;
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
   * precision, so while they are untouched this exact instant is sent back instead of a re-derived one.
   */
  initialDueAt?: string | null;
  submitLabel: string;
  onSubmit: (input: CreateTodoInput) => Promise<void>;
  onCancel?: () => void;
}

export function TodoForm({
  initialValues = EMPTY_FORM,
  initialDueAt,
  submitLabel,
  onSubmit,
  onCancel,
}: TodoFormProps) {
  const id = useId();
  const [values, setValues] = useState(initialValues);
  /** What the form started from; later prop changes (a background refetch) must not move it. */
  const [initial] = useState({ values: initialValues, dueAt: initialDueAt });
  const [errors, setErrors] = useState<SplitErrors>({ fields: {}, general: null });
  const [submitting, setSubmitting] = useState(false);

  /** The deadline is one `dueAt` field on the wire, entered through the date and time inputs. */
  const errorFor = (name: keyof TodoFormValues) =>
    errors.fields[name] ?? (name === 'dueDate' ? errors.fields.dueAt : undefined);

  const change = (name: keyof TodoFormValues, value: string) =>
    setValues((current) => {
      const next = { ...current, [name]: value };
      if (name === 'dueDate') {
        if (value === '') next.dueTime = '';
        else if (current.dueTime === '') next.dueTime = DEFAULT_DUE_TIME;
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
    const input = toInput(values);
    const deadlineUntouched =
      values.dueDate === initial.values.dueDate && values.dueTime === initial.values.dueTime;
    if (deadlineUntouched && initial.dueAt !== undefined) input.dueAt = initial.dueAt;
    const parsed = CreateTodoSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(splitErrors(toFieldErrors(parsed.error)));
      return;
    }
    setErrors({ fields: {}, general: null });
    setSubmitting(true);
    try {
      await onSubmit(input);
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
