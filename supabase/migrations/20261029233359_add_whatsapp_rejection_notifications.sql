ALTER TABLE public.loan_applications
  ADD COLUMN whatsapp_rejection_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_rejection_opt_in_at timestamptz,
  ADD COLUMN whatsapp_rejection_consent_version text,
  ADD COLUMN whatsapp_rejection_status text NOT NULL DEFAULT 'not_eligible',
  ADD COLUMN whatsapp_rejection_sent_at timestamptz,
  ADD COLUMN whatsapp_rejection_message_id text,
  ADD COLUMN whatsapp_rejection_error_code text;

ALTER TABLE public.loan_applications
  ADD CONSTRAINT loan_applications_whatsapp_rejection_status_check
  CHECK (whatsapp_rejection_status IN (
    'not_eligible',
    'pending',
    'sending',
    'sent',
    'failed',
    'unknown'
  ));

COMMENT ON COLUMN public.loan_applications.whatsapp_rejection_opt_in IS
  'Indica si la persona aceptó recibir por WhatsApp una notificación sobre el resultado de su solicitud.';
COMMENT ON COLUMN public.loan_applications.whatsapp_rejection_opt_in_at IS
  'Fecha y hora en que se registró el consentimiento opcional para la notificación por WhatsApp.';
COMMENT ON COLUMN public.loan_applications.whatsapp_rejection_consent_version IS
  'Versión del texto de consentimiento aceptado para la notificación por WhatsApp.';
COMMENT ON COLUMN public.loan_applications.whatsapp_rejection_status IS
  'Estado del único aviso de rechazo por WhatsApp; solo lo modifica la función de administración.';
