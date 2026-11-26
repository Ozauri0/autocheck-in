export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Valores enviados, para no perderlos cuando React reinicia el formulario. */
  values?: Record<string, string>;
}
