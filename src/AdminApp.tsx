import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './AdminApp.css'

type Document = {
  id: string
  document_type: string
  original_filename: string
  file_size_bytes: number
  signed_url: string
}

type Application = {
  id: string
  created_at: string
  full_name: string
  dni: string
  dni_updated: boolean
  phone: string
  has_referrer: boolean
  referrer_full_name: string | null
  referrer_phone: string | null
  referrer_relationship: string | null
  alternate_phone: string
  alternate_phone_relationship: string
  address: string
  between_streets: string
  locality: string
  housing_type: string
  has_service_in_own_name: boolean
  service_types: string[]
  has_debts: boolean
  debt_reason: string | null
  debt_amount: number | null
  loan_amount: number
  loan_frequency: string
  installment_count: number
  installment_amount: number
  total_to_pay: number
  loan_purpose: string
  status: string
  decided_at: string | null
  decided_by: string | null
  admin_notes: string | null
  whatsapp_rejection_opt_in: boolean
  whatsapp_rejection_status: string
  whatsapp_rejection_sent_at: string | null
  whatsapp_rejection_message_id: string | null
  whatsapp_rejection_error_code: string | null
  incomes: Record<string, unknown>[]
  documents: Document[]
}

const money = (amount: unknown) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(amount) || 0)

const incomeLabels: Record<string, string> = {
  formal_employment: 'Trabajo en blanco',
  informal_employment: 'Trabajo informal',
  self_employed: 'Cuenta propia',
  business: 'Comercio',
  allowance: 'Asignación',
  retirement: 'Jubilación',
  pension: 'Pensión',
  cooperative: 'Cooperativa',
  other: 'Otros ingresos',
}

const documentLabels: Record<string, string> = {
  dni_front: 'DNI frente',
  dni_back: 'DNI dorso',
  rental_contract: 'Contrato de alquiler',
  utility_bill: 'Comprobante de domicilio',
  service_holder_dni_front: 'DNI del titular frente',
  service_holder_dni_back: 'DNI del titular dorso',
  salary_receipt: 'Recibo de sueldo',
  wallet_statement: 'Resumen de billetera',
  business_photo: 'Foto del comercio',
  business_video: 'Video del comercio',
  income_proof: 'Comprobante de ingresos',
}

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  under_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [applications, setApplications] = useState<Application[]>([])
  const [selected, setSelected] = useState<Application | null>(null)
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextOffset, setNextOffset] = useState(0)
  const [whatsAppApplicant, setWhatsAppApplicant] = useState<Application | null>(null)
  const [whatsAppNumber, setWhatsAppNumber] = useState('')

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })
    return () => subscription.unsubscribe()
  }, [])

  const callAdmin = useCallback(async (body: Record<string, string>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('loan-admin-panel', { body })
    if (invokeError) throw new Error(invokeError.message)
    if (!data?.success) throw new Error(data?.error || 'No se pudo completar la operación.')
    return data
  }, [])

  const loadApplications = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError('')
    setDecisionNote('')
    try {
      const data = await callAdmin({ action: 'list', status: filter, offset: '0' })
      const rows = (data.applications ?? []) as Application[]
      setApplications(rows)
      setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null)
      setHasMore(Boolean(data.has_more))
      setNextOffset(Number(data.next_offset ?? rows.length))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las solicitudes.')
    } finally {
      setLoading(false)
    }
  }, [session, filter, callAdmin])

  const loadMoreApplications = useCallback(async () => {
    if (!session || loading || !hasMore) return
    setLoading(true)
    setError('')
    try {
      const data = await callAdmin({ action: 'list', status: filter, offset: String(nextOffset) })
      const rows = (data.applications ?? []) as Application[]
      setApplications((current) => [...current, ...rows])
      setHasMore(Boolean(data.has_more))
      setNextOffset(Number(data.next_offset ?? nextOffset + rows.length))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar más solicitudes.')
    } finally {
      setLoading(false)
    }
  }, [session, loading, hasMore, filter, nextOffset, callAdmin])

  useEffect(() => {
    void loadApplications()
  }, [loadApplications])

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError('No se pudo iniciar sesión. Verificá tus datos.')
  }

  const decide = async (status: 'approved' | 'rejected') => {
    if (!selected) return
    const verb = status === 'approved' ? 'aprobar' : 'rechazar'
    if (!window.confirm('¿Confirmás ' + verb + ' la solicitud de ' + selected.full_name + '?')) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await callAdmin({ action: 'decide', application_id: selected.id, status, admin_notes: decisionNote })
      setDecisionNote('')
      if (status === 'rejected') {
        const delivery = result.notification?.status
        const deliveryNotice: Record<string, string> = {
          sent: 'Solicitud rechazada y aviso enviado por WhatsApp.',
          pending: 'Solicitud rechazada. El aviso quedó pendiente de configurar WhatsApp Cloud API.',
          failed: 'Solicitud rechazada, pero no se pudo enviar el aviso. Podés revisar el estado y reintentar desde la solicitud.',
          unknown: 'Solicitud rechazada. No se pudo confirmar si WhatsApp recibió el aviso; revisá el estado antes de reintentar.',
          not_eligible: 'Solicitud rechazada. No se envió el aviso porque no hay consentimiento de WhatsApp.',
        }
        setNotice(deliveryNotice[String(delivery)] || 'Solicitud rechazada.')
      } else {
        setNotice('Solicitud aprobada.')
      }
      if (status === 'approved') {
        setWhatsAppApplicant(selected)
        setWhatsAppNumber(formatWhatsAppNumber(selected.phone))
      }
      setSelected(null)
      await loadApplications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado.')
    } finally {
      setLoading(false)
    }
  }


  const formatWhatsAppNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.startsWith('549')) return `+${digits}`
    if (digits.startsWith('54')) return `+549${digits.slice(2)}`
    return `+549${digits}`
  }

  const prepareWhatsAppMessage = (application: Application) => {
    setWhatsAppApplicant(application)
    setWhatsAppNumber(formatWhatsAppNumber(application.phone))
  }

  const retryRejectionWhatsApp = async () => {
    if (!selected) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await callAdmin({ action: 'retry_rejection_whatsapp', application_id: selected.id })
      const status = String(result.notification?.status || '')
      const deliveryNotice: Record<string, string> = {
        sent: 'El aviso de rechazo se envió por WhatsApp.',
        pending: 'El aviso sigue pendiente: falta completar la configuración de WhatsApp Cloud API.',
        failed: 'Meta rechazó el envío. Revisá la configuración y volvé a intentar.',
        unknown: 'No se pudo confirmar si Meta recibió el aviso. No lo reintentes hasta revisar el estado en Meta.',
      }
      setNotice(deliveryNotice[status] || 'Se actualizó el estado del aviso.')
      await loadApplications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo reintentar el aviso.')
    } finally {
      setLoading(false)
    }
  }

  const deleteApplication = async () => {
    if (!selected) return
    const name = selected.full_name
    if (!window.confirm('Vas a eliminar permanentemente la solicitud de ' + name + ' y sus documentos. Esta acción no se puede deshacer. ¿Continuar?')) return
    if (window.prompt('Para confirmar, escribí ELIMINAR') !== 'ELIMINAR') return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      await callAdmin({ action: 'delete', application_id: selected.id })
      if (whatsAppApplicant?.id === selected.id) {
        setWhatsAppApplicant(null)
        setWhatsAppNumber('')
      }
      setSelected(null)
      setNotice('La solicitud y sus documentos fueron eliminados permanentemente.')
      await loadApplications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la solicitud.')
    } finally {
      setLoading(false)
    }
  }

  const whatsAppDigits = whatsAppNumber.replace(/\D/g, '')
  const whatsAppMessage = whatsAppApplicant
    ? `Hola ${whatsAppApplicant.full_name}. Revisamos tu solicitud y cumplís con las condiciones para acceder a un préstamo. Para continuar con el proceso, respondé este mensaje y un asesor te brindará el asesoramiento sobre los próximos pasos. — Préstamos Variety.`
    : ''

  if (!session) {
    return (
      <main className="admin-login">
        <div className="admin-brand"><span className="logo-frame admin-logo-frame"><img src={`${import.meta.env.BASE_URL}prestamos-variety-logo.jpg`} alt="Préstamos Variety" /></span><div><b>PRÉSTAMOS VARIETY</b><small>Administración de préstamos</small></div></div>
        <form onSubmit={signIn}>
          <h1>Ingresar</h1>
          <p>Acceso exclusivo para personal autorizado.</p>
          <label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="admin-primary">Iniciar sesión</button>
        </form>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-top">
        <div className="admin-brand"><span className="logo-frame admin-logo-frame"><img src={`${import.meta.env.BASE_URL}prestamos-variety-logo.jpg`} alt="Préstamos Variety" /></span><div><b>PRÉSTAMOS VARIETY</b><small>Panel de solicitudes</small></div></div>
        <button className="admin-logout" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button>
      </header>
      <section className="admin-heading">
        <div><p className="admin-kicker">GESTIÓN DE CRÉDITOS</p><h1>Solicitudes de préstamos</h1><p>Revisá los datos y documentos antes de tomar una decisión.</p></div>
        <select aria-label="Filtrar solicitudes" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="pending">Pendientes</option><option value="under_review">En revisión</option><option value="approved">Aprobadas</option><option value="rejected">Rechazadas</option><option value="all">Todas</option>
        </select>
      </section>
      {(error || notice) && <p className={error ? 'admin-error' : 'admin-message'} role="status">{error || notice}</p>}
      {whatsAppApplicant && (
        <section className="whatsapp-card" aria-label="Mensaje de aprobación por WhatsApp">
          <div>
            <h2>Continuar el asesoramiento por WhatsApp</h2>
            <p>Revisá el número y el texto. WhatsApp Business se abrirá para que confirmes el envío.</p>
          </div>
          <label>Número de WhatsApp
            <input type="tel" value={whatsAppNumber} onChange={(event) => setWhatsAppNumber(event.target.value)} placeholder="+549…" />
          </label>
          <label>Mensaje
            <textarea rows={4} readOnly value={whatsAppMessage} />
          </label>
          {/^549\d{10}$/.test(whatsAppDigits)
            ? <a className="whatsapp-link" href={`https://wa.me/${whatsAppDigits}?text=${encodeURIComponent(whatsAppMessage)}`} target="_blank" rel="noreferrer">Abrir chat en WhatsApp</a>
            : <p className="whatsapp-hint">El número se prepara con el prefijo +549. Corregilo si hace falta; para Argentina debe tener +549 y 10 dígitos.</p>}
          <button className="whatsapp-dismiss" onClick={() => { setWhatsAppApplicant(null); setWhatsAppNumber('') }}>Cerrar aviso</button>
        </section>
      )}
      <div className="admin-layout">
        <section className="admin-list" aria-label="Listado de solicitudes">
          <div className="admin-list-header"><b>{applications.length} solicitudes cargadas</b><button onClick={() => void loadApplications()} disabled={loading}>Actualizar</button></div>
          {loading && <p className="admin-empty">Cargando…</p>}
          {!loading && applications.length === 0 && <p className="admin-empty">No hay solicitudes en este filtro.</p>}
          {applications.map((application) => (
            <button className={'application-row ' + (selected?.id === application.id ? 'is-selected' : '')} key={application.id} onClick={() => { setSelected(application); setDecisionNote('') }}>
              <span className={'status-dot status-' + application.status} />
              <span className="application-summary"><b>{application.full_name}</b><small>DNI {application.dni} · {new Date(application.created_at).toLocaleDateString('es-AR')}</small></span>
              <strong>{money(application.loan_amount)}</strong>
            </button>
          ))}
          {hasMore && <div className="admin-list-header"><button onClick={() => void loadMoreApplications()} disabled={loading}>{loading ? 'Cargando…' : 'Cargar más solicitudes'}</button></div>}
        </section>
        <section className="application-detail">
          {!selected ? <div className="admin-empty detail-placeholder">Elegí una solicitud para ver sus datos y documentación.</div> : (
            <>
              <div className="detail-header">
                <div><span className={'status-badge status-' + selected.status}>{statusLabel[selected.status] || selected.status}</span><h2>{selected.full_name}</h2><p>Solicitud {selected.id} · {new Date(selected.created_at).toLocaleString('es-AR')}</p></div>
              </div>
              <div className="detail-grid">
                <div><small>DNI</small><b>{selected.dni} {selected.dni_updated ? '· actualizado' : ''}</b></div>
                <div><small>Teléfono</small><b>{selected.phone}</b></div>
                <div><small>¿Vino recomendado?</small><b>{selected.has_referrer ? 'Sí' : 'No'}</b></div>
                {selected.has_referrer && <>
                  <div><small>Persona que recomendó</small><b>{selected.referrer_full_name || '—'}</b></div>
                  <div><small>Teléfono del referente</small><b>{selected.referrer_phone || '—'}</b></div>
                  <div><small>Vínculo con el referente</small><b>{selected.referrer_relationship || '—'}</b></div>
                </>}
                <div><small>Contacto alternativo</small><b>{selected.alternate_phone} · {selected.alternate_phone_relationship}</b></div>
                <div><small>Domicilio</small><b>{selected.address}, {selected.locality}</b></div>
                <div><small>Entre calles</small><b>{selected.between_streets || '—'}</b></div>
                <div><small>Vivienda</small><b>{selected.housing_type}</b></div>
                <div><small>Préstamo solicitado</small><b>{money(selected.loan_amount)}</b></div>
                <div><small>Plan de pago</small><b>{selected.installment_count} cuotas {selected.loan_frequency === 'weekly' ? 'semanales' : selected.loan_frequency === 'fortnightly' ? 'quincenales' : 'mensuales'} de {money(selected.installment_amount)}</b></div>
                <div><small>Total estimado</small><b>{money(selected.total_to_pay)}</b></div>
                <div><small>Servicios a su nombre</small><b>{selected.has_service_in_own_name ? 'Sí' : 'No'}</b></div>
                <div className="detail-wide"><small>Destino del préstamo</small><b>{selected.loan_purpose}</b></div>
                {selected.has_debts && <div className="detail-wide"><small>Deudas declaradas</small><b>{selected.debt_reason} · {money(selected.debt_amount)}</b></div>}
              </div>
              <div className="detail-subsection">
                <h3>Ingresos declarados</h3>
                {selected.incomes.length ? selected.incomes.map((income, index) => <div className="income-row" key={String(income.source_type) + index}><b>{incomeLabels[String(income.source_type)] || String(income.source_type)}</b><span>{money(income.monthly_income)} por mes</span></div>) : <p>Sin datos de ingresos.</p>}
              </div>
              <div className="detail-subsection">
                <h3>Documentación <span>{selected.documents.length}</span></h3>
                {selected.documents.length ? selected.documents.map((document) => (
                  <a className="document-row" key={document.id} href={document.signed_url} target="_blank" rel="noreferrer">
                    <span>▧</span><span><b>{documentLabels[document.document_type] || document.document_type}</b><small>{document.original_filename} · {Math.max(1, Math.round(document.file_size_bytes / 1024))} KB</small></span><strong>Ver ↗</strong>
                  </a>
                )) : <p>No hay documentos cargados.</p>}
              </div>
              {(selected.decided_at || selected.decided_by || selected.admin_notes) && (
                <div className="detail-subsection">
                  <h3>Registro de decisión</h3>
                  {selected.decided_at && <p><b>Fecha:</b> {new Date(selected.decided_at).toLocaleString('es-AR')}</p>}
                  {selected.decided_by && <p><b>Cuenta administradora:</b> {selected.decided_by === session.user.id ? session.user.email || selected.decided_by : selected.decided_by}</p>}
                  {selected.admin_notes && <p><b>Nota interna:</b> {selected.admin_notes}</p>}
                </div>
              )}
              {selected.status === 'rejected' && (
                <div className="detail-subsection">
                  <h3>Aviso de rechazo por WhatsApp</h3>
                  {!selected.whatsapp_rejection_opt_in
                    ? <p>No se envió: la persona no aceptó recibir el aviso por WhatsApp.</p>
                    : <>
                        <p><b>Estado:</b> {{
                          pending: 'Pendiente de configuración',
                          sending: 'En proceso',
                          sent: 'Enviado',
                          failed: 'Falló el envío',
                          unknown: 'No se pudo confirmar el resultado',
                          not_eligible: 'Sin consentimiento',
                        }[selected.whatsapp_rejection_status] || selected.whatsapp_rejection_status}</p>
                        {selected.whatsapp_rejection_sent_at && <p><b>Fecha de envío:</b> {new Date(selected.whatsapp_rejection_sent_at).toLocaleString('es-AR')}</p>}
                        {selected.whatsapp_rejection_error_code && <p><b>Detalle técnico:</b> {selected.whatsapp_rejection_error_code}</p>}
                        {(selected.whatsapp_rejection_status === 'pending' || selected.whatsapp_rejection_status === 'failed') && (
                          <button className="whatsapp-prepare" disabled={loading} onClick={() => void retryRejectionWhatsApp()}>
                            {selected.whatsapp_rejection_status === 'pending' ? 'Intentar envío por WhatsApp' : 'Reintentar aviso por WhatsApp'}
                          </button>
                        )}
                      </>}
                </div>
              )}
              {selected.status === 'approved' && (
                <div className="detail-subsection">
                  <button className="whatsapp-prepare" onClick={() => prepareWhatsAppMessage(selected)}>Preparar mensaje por WhatsApp</button>
                </div>
              )}
              {(selected.status === 'pending' || selected.status === 'under_review') && (
                <>
                  <div className="detail-subsection">
                    <label className="admin-note-label" htmlFor="decision-note">Nota interna para esta decisión (opcional)</label>
                    <textarea
                      id="decision-note"
                      className="admin-note-input"
                      rows={3}
                      maxLength={2000}
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                    />
                    <small>{decisionNote.length}/2000 caracteres</small>
                  </div>
                  <div className="decision-actions"><button disabled={loading} className="reject-button" onClick={() => void decide('rejected')}>Rechazar</button><button disabled={loading} className="approve-button" onClick={() => void decide('approved')}>Aprobar solicitud</button></div>
                </>
              )}
              <div className="delete-actions"><button disabled={loading} className="delete-button" onClick={() => void deleteApplication()}>Eliminar solicitud y documentos</button></div>
            </>
          )}
        </section>
      </div>
      <footer className="admin-privacy">La información de las solicitudes es confidencial. Los documentos se abren mediante enlaces privados temporales.</footer>
    </main>
  )
}
