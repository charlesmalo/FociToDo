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
  dueDate: string;
}

export const EMPTY_FORM: TodoFormValues = { title: '', description: '', dueDate: '' };

export function toInput(values: TodoFormValues): CreateTodoInput {
  return {
    title: values.title,
    description: values.description === '' ? null : values.description,
    dueDate: values.dueDate === '' ? null : values.dueDate,
  };
}

export function toFormValues(todo: TodoView): TodoFormValues {
  return { title: todo.title, description: todo.description ?? '', dueDate: todo.dueDate ?? '' };
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
  submitLabel: string;
  onSubmit: (input: CreateTodoInput) => Promise<void>;
  onCancel?: () => void;
}

export function TodoForm({
  initialValues = EMPTY_FORM,
  submitLabel,
  onSubmit,
  onCancel,
}: TodoFormProps) {
  const id = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<SplitErrors>({ fields: {}, general: null });
  const [submitting, setSubmitting] = useState(false);

  const fieldProps = (name: keyof TodoFormValues) => {
    const error = errors.fields[name];
    return {
      id: `${id}-${name}`,
      value: values[name],
      'aria-invalid': error !== undefined,
      'aria-describedby': error === undefined ? undefined : `${id}-${name}-error`,
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = toInput(values);
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
      <Field id={`${id}-dueDate`} label="Due date" error={errors.fields.dueDate}>
        <input type="date" {...fieldProps('dueDate')} />
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
