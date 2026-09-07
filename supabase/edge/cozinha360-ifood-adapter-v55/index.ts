import { createClient } from 'npm:@supabase/supabase-js@2.115.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLUG = 'cozinha360-ifood-adapter-v55'
const VERSION = '5.5.1'

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const enc = new TextEncoder()
const dec = new TextDecoder()
const now = () => new Date().toISOString()
const env = (name: string) => (Deno.env.get(name) || '').trim()

function json(_req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function b64(bytes: Uint8Array) {
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64(value: string) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0))
}

async function sha(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function routePath(req: Request) {
  const pathname = new URL(req.url).pathname
  const marker = `/${SLUG}`
  const index = pathname.indexOf(marker)
  return index >= 0 ? pathname.slice(index + marker.length) || '/' : pathname
}

class HttpError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body: unknown = {}) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function api(url: string, init: RequestInit, label: string) {
  const response = await fetch(url, init)
  if (response.status === 204) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new HttpError(
      response.status,
      String(
        body?.error?.message ||
          body?.message ||
          body?.error_description ||
          body?.error ||
          `${label} recusou a solicitação`,
      ),
      body,
    )
  }
  return body
}

async function rootBytes() {
  const seed = env('C360_INTEGRATION_KEY') || `${SERVICE_KEY}:c360-integrations-v29`
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(seed)))
}

async function aesKey() {
  return crypto.subtle.importKey('raw', await rootBytes(), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function seal(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(),
    enc.encode(JSON.stringify(value)),
  )
  return { ciphertext: b64(new Uint8Array(encrypted)), iv: b64(iv) }
}

async function openSecret(row: any) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(row.iv) },
    await aesKey(),
    unb64(row.ciphertext),
  )
  return JSON.parse(dec.decode(plain))
}

function safeJson(value: any, fallback: any) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value ?? fallback
  } catch {
    return fallback
  }
}

async function credential(connectionId: number) {
  const result = await admin
    .from('integration_credentials')
    .select('*')
    .eq('connection_id', connectionId)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data
    ? {
        row: result.data,
        secret: await openSecret(result.data),
        metadata: safeJson(result.data.metadata_json, {}),
      }
    : null
}

async function saveCredential(connection: any, cred: any, secret: any, expiresAt: string | null) {
  const encrypted = await seal(secret)
  const result = await admin
    .from('integration_credentials')
    .update({
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      expires_at: expiresAt,
      metadata_json: JSON.stringify({ ...cred.metadata, refreshed_at: now() }),
      updated_at: now(),
    })
    .eq('connection_id', connection.id)
  if (result.error) throw result.error
}

async function ensureFresh(connection: any, cred: any) {
  const expiresAt = cred.row.expires_at ? Date.parse(cred.row.expires_at) : 0
  if (!expiresAt || expiresAt > Date.now() + 5 * 60_000) return cred
  if (!cred.secret.refreshToken) {
    throw new Error('Token iFood expirado e sem refresh token. Reconecte a conta.')
  }

  const form = new URLSearchParams({
    grantType: 'refresh_token',
    clientId: env('IFOOD_CLIENT_ID'),
    clientSecret: env('IFOOD_CLIENT_SECRET'),
    refreshToken: String(cred.secret.refreshToken),
  })
  const fresh = await api(
    'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token',
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    },
    'iFood refresh',
  )
  const secret = { ...cred.secret, ...fresh }
  const seconds = Number(secret.expiresIn || 21600)
  const nextExpiry = new Date(Date.now() + seconds * 1000).toISOString()
  await saveCredential(connection, cred, secret, nextExpiry)
  return {
    ...cred,
    secret,
    row: { ...cred.row, expires_at: nextExpiry },
    metadata: { ...cred.metadata, refreshed_at: now() },
  }
}

async function auth(req: Request) {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) return null

  let profile = (
    await admin.from('users').select('id,email').eq('auth_user_id', data.user.id).maybeSingle()
  ).data
  if (!profile && data.user.email) {
    profile = (
      await admin.from('users').select('id,email').ilike('email', data.user.email).maybeSingle()
    ).data
  }
  return profile || null
}

async function member(userId: number, businessId: number, write = false) {
  const result = await admin
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!result.data) return null
  if (write && !['owner', 'admin'].includes(result.data.role)) return null
  return result.data
}

async function workerAuthorized(req: Request) {
  const key = req.headers.get('x-c360-worker-key') || ''
  if (!key) return false
  const result = await admin.rpc('c360_verify_worker_key', { p_value: key })
  return !result.error && result.data === true
}

const canonicalMap: Record<string, string> = {
  PLC: 'order.received',
  PLACED: 'order.received',
  CFM: 'order.confirmed',
  CONFIRMED: 'order.confirmed',
  SPS: 'order.preparing',
  PREPARATION_STARTED: 'order.preparing',
  RTP: 'order.ready',
  READY_TO_PICKUP: 'order.ready',
  DSP: 'order.dispatched',
  DISPATCHED: 'order.dispatched',
  CON: 'order.completed',
  CONCLUDED: 'order.completed',
  CAN: 'order.cancelled',
  CANCELLED: 'order.cancelled',
  CCR: 'order.cancellation_requested',
  CANCELLATION_REQUESTED: 'order.cancellation_requested',
}

function canonical(event: any) {
  return (
    canonicalMap[String(event.code || '').toUpperCase()] ||
    canonicalMap[String(event.fullCode || '').toUpperCase()] ||
    null
  )
}

const statusByCanonical: Record<string, string> = {
  'order.received': 'new',
  'order.confirmed': 'confirmed',
  'order.preparing': 'production',
  'order.ready': 'awaiting_delivery',
  'order.dispatched': 'awaiting_delivery',
  'order.completed': 'completed',
  'order.cancelled': 'cancelled',
  'order.cancellation_requested': 'checking',
}
const statusRank: Record<string, number> = {
  new: 0,
  confirmed: 1,
  production: 2,
  checking: 2,
  awaiting_delivery: 3,
  completed: 4,
  cancelled: 5,
}

function cents(value: any) {
  if (value === null || value === undefined || value === '') return 0
  const numeric = Number(String(value).replace(',', '.'))
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100)) : 0
}

function paid(details: any) {
  const payments = details?.payments
  if (!payments) return false
  if (Number(payments.prepaid || 0) > 0) return true
  const methods = Array.isArray(payments.methods) ? payments.methods : []
  return (
    methods.length > 0 &&
    methods.every((method: any) => {
      const type = String(method.method || method.type || method.paymentMode || '').toUpperCase()
      return type.includes('ONLINE') || type.includes('PREPAID')
    })
  )
}

function itemRef(item: any, index: number) {
  return String(
    item.externalCode ||
      item.id ||
      item.productId ||
      item.ean ||
      `name:${String(item.name || 'item').trim().toLowerCase()}:${index}`,
  )
}

async function ensureProduct(binding: any, item: any, index: number) {
  const ref = itemRef(item, index)
  const found = await admin
    .from('integration_product_mappings')
    .select('product_id,mapping_source')
    .eq('business_id', binding.business_id)
    .eq('brand_id', binding.brand_id)
    .eq('provider', 'ifood')
    .eq('external_product_ref', ref)
    .eq('active', true)
    .maybeSingle()
  if (found.error) throw found.error
  if (found.data) {
    return {
      productId: Number(found.data.product_id),
      pending: found.data.mapping_source === 'auto_shadow',
    }
  }

  const product = await admin
    .from('products')
    .insert({
      business_id: binding.business_id,
      brand_id: binding.brand_id,
      name: String(item.name || 'Item iFood').slice(0, 180),
      category: 'iFood · não mapeado',
      active: false,
      units_per_batch: 1,
      packaging_cents_per_unit: 0,
      energy_cents_per_batch: 0,
      labor_cents_per_batch: 0,
    })
    .select('id')
    .single()
  if (product.error) throw product.error

  const mapping = await admin
    .from('integration_product_mappings')
    .insert({
      business_id: binding.business_id,
      brand_id: binding.brand_id,
      provider: 'ifood',
      external_product_ref: ref,
      external_name: String(item.name || 'Item iFood').slice(0, 220),
      product_id: product.data.id,
      mapping_source: 'auto_shadow',
      active: true,
    })
  if (mapping.error) throw mapping.error
  return { productId: Number(product.data.id), pending: true }
}

async function getDetails(orderId: string, token: string) {
  return api(
    `https://merchant-api.ifood.com.br/order/v1.0/orders/${encodeURIComponent(orderId)}`,
    { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
    'Detalhes do pedido iFood',
  )
}

async function ensureOrder(binding: any, event: any, token: string, canonicalType: string) {
  const externalOrderId = String(event.orderId || event.metadata?.id || '')
  if (!externalOrderId) throw new Error('Evento iFood sem orderId')
  const idempotencyKey = `ifood:${externalOrderId}`
  const existing = await admin
    .from('orders')
    .select('*')
    .eq('business_id', binding.business_id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing.error) throw existing.error

  const target = statusByCanonical[canonicalType] || 'new'
  if (existing.data) {
    const current = String(existing.data.status)
    const canAdvance =
      target === 'cancelled' ||
      (current !== 'completed' &&
        current !== 'cancelled' &&
        (statusRank[target] ?? 0) >= (statusRank[current] ?? 0))
    if (canAdvance) {
      const patch: Record<string, unknown> = {
        status: target,
        version: Number(existing.data.version || 1) + 1,
        updated_at: now(),
      }
      if (target === 'completed') patch.completed_at = now()
      const update = await admin.from('orders').update(patch).eq('id', existing.data.id)
      if (update.error) throw update.error
    }
    return {
      id: Number(existing.data.id),
      details: null,
      created: false,
      pendingMappings: Boolean(existing.data.error_flag),
    }
  }

  let details: any
  try {
    details = await getDetails(externalOrderId, token)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new Error('ORDER_DETAILS_NOT_READY')
    }
    throw error
  }

  const items = Array.isArray(details?.items) ? details.items : []
  const mapped: any[] = []
  const pendingMappings: boolean[] = []
  for (let index = 0; index < items.length; index += 1) {
    const mapping = await ensureProduct(binding, items[index], index)
    mapped.push({ ...mapping, item: items[index] })
    pendingMappings.push(mapping.pending)
  }

  const total = cents(
    details?.total?.orderAmount ?? details?.total?.subTotal ?? details?.orderAmount ?? 0,
  )
  const hasPending = pendingMappings.some(Boolean)
  const inserted = await admin
    .from('orders')
    .insert({
      business_id: binding.business_id,
      brand_id: binding.brand_id,
      channel_id: binding.channel_id || null,
      status: target,
      source: 'ifood',
      total_cents: total,
      variable_cost_cents: 0,
      contribution_cents: hasPending ? 0 : total,
      paid: paid(details),
      delayed: false,
      error_flag: hasPending,
      idempotency_key: idempotencyKey,
      inventory_consumed: false,
    })
    .select('id')
    .single()

  if (inserted.error) {
    if (String(inserted.error.code) === '23505') {
      const retry = await admin
        .from('orders')
        .select('id,error_flag')
        .eq('business_id', binding.business_id)
        .eq('idempotency_key', idempotencyKey)
        .single()
      if (retry.error) throw retry.error
      return {
        id: Number(retry.data.id),
        details,
        created: false,
        pendingMappings: Boolean(retry.data.error_flag),
      }
    }
    throw inserted.error
  }

  for (const row of mapped) {
    const item = row.item
    const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)))
    const unitPrice = cents(item.unitPrice ?? item.price ?? Number(item.totalPrice || 0) / quantity)
    const insertedItem = await admin.from('order_items').insert({
      business_id: binding.business_id,
      order_id: inserted.data.id,
      product_id: row.productId,
      quantity,
      unit_price_cents: unitPrice,
      unit_variable_cost_cents: 0,
    })
    if (insertedItem.error) throw insertedItem.error
  }

  return {
    id: Number(inserted.data.id),
    details,
    created: true,
    pendingMappings: hasPending,
  }
}

async function markEvent(
  id: number,
  status: string,
  canonicalType: string | null = null,
  normalized: unknown = null,
  orderId: number | null = null,
  error: string | null = null,
  retryAt: string | null = null,
) {
  const result = await admin.rpc('c360_mark_integration_event', {
    p_event_id: id,
    p_status: status,
    p_canonical_event_type: canonicalType,
    p_normalized_json: normalized ? JSON.stringify(normalized) : null,
    p_canonical_order_id: orderId,
    p_error: error,
    p_next_retry_at: retryAt,
  })
  if (result.error) throw result.error
  return result.data
}

async function processEvent(binding: any, connection: any, event: any, token: string) {
  const raw = JSON.stringify(event)
  const eventId = String(event.id || '')
  if (!eventId) return { ack: false, error: 'event_without_id' }

  const ingested = await admin.rpc('c360_ingest_integration_event', {
    p_business_id: binding.business_id,
    p_provider: 'ifood',
    p_external_event_id: eventId,
    p_event_type: String(event.fullCode || event.code || 'UNKNOWN'),
    p_external_order_id: String(event.orderId || event.metadata?.id || ''),
    p_occurred_at: event.createdAt || null,
    p_payload_sha256: await sha(raw),
    p_payload_json: raw,
    p_signature_verified: false,
    p_connection_id: connection.id,
  })
  if (ingested.error) throw ingested.error

  const stored: any = ingested.data
  const dbEventId = Number(stored.id)
  if (
    stored.idempotent_replay &&
    ['processed', 'ignored'].includes(String(stored.status))
  ) {
    return { ack: true, id: eventId, replay: true }
  }

  const canonicalType = canonical(event)
  try {
    await markEvent(dbEventId, 'processing')
    if (!canonicalType) {
      await markEvent(dbEventId, 'ignored', null, {
        transport: 'oauth_polling',
        reason: 'unsupported_event',
        event,
      })
      return { ack: true, id: eventId, ignored: true }
    }

    const order = await ensureOrder(binding, event, token, canonicalType)
    await markEvent(
      dbEventId,
      'processed',
      canonicalType,
      {
        transport: 'oauth_polling',
        event,
        order_summary: order.details
          ? {
              id: order.details.id,
              displayId: order.details.displayId,
              orderType: order.details.orderType,
              orderTiming: order.details.orderTiming,
              category: order.details.category,
              total: order.details.total,
              payments: order.details.payments,
              delivery: order.details.delivery,
              takeout: order.details.takeout,
              items: order.details.items,
            }
          : null,
        pending_product_mapping: order.pendingMappings,
      },
      order.id,
    )
    return {
      ack: true,
      id: eventId,
      canonical: canonicalType,
      order_id: order.id,
      created: order.created,
    }
  } catch (error) {
    const message = String((error as any)?.message || error)
    const delay = message === 'ORDER_DETAILS_NOT_READY' ? 30 : 120
    await markEvent(
      dbEventId,
      'failed',
      canonicalType,
      null,
      null,
      message,
      new Date(Date.now() + delay * 1000).toISOString(),
    ).catch(() => {})
    return { ack: false, id: eventId, error: message }
  }
}

async function pollBinding(binding: any) {
  const connectionResult = await admin
    .from('integration_connections')
    .select('*')
    .eq('id', binding.connection_id)
    .eq('business_id', binding.business_id)
    .eq('provider', 'ifood')
    .eq('status', 'active')
    .maybeSingle()
  if (connectionResult.error || !connectionResult.data) {
    return { binding_id: binding.id, skipped: 'connection_not_active' }
  }

  const connection = connectionResult.data
  let cred = await credential(connection.id)
  if (!cred) return { binding_id: binding.id, skipped: 'credential_missing' }

  try {
    cred = await ensureFresh(connection, cred)
    const merchant = String(binding.external_store_ref || connection.external_account_ref || '')
    if (!merchant) throw new Error('Merchant iFood não selecionado')

    const response = await api(
      'https://merchant-api.ifood.com.br/events/v1.0/events:polling',
      {
        headers: {
          authorization: `Bearer ${cred.secret.accessToken}`,
          'x-polling-merchants': merchant,
          accept: 'application/json',
        },
      },
      'Polling iFood',
    )
    const events = Array.isArray(response)
      ? response
      : Array.isArray(response?.events)
        ? response.events
        : []
    const results: any[] = []
    const acknowledgments: string[] = []

    for (const event of events) {
      if (event.merchantId && String(event.merchantId) !== merchant) continue
      const result = await processEvent(binding, connection, event, cred.secret.accessToken)
      results.push(result)
      if (result.ack) acknowledgments.push(result.id)
    }

    if (acknowledgments.length) {
      await api(
        'https://merchant-api.ifood.com.br/events/v1.0/events/acknowledgment',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${cred.secret.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(acknowledgments.map((id) => ({ id }))),
        },
        'Acknowledgment iFood',
      )
    }

    await admin
      .from('brand_integration_bindings')
      .update({ last_sync_at: now(), last_success_at: now(), last_error: null, updated_at: now() })
      .eq('id', binding.id)
    await admin
      .from('integration_connections')
      .update({ last_success_at: now(), last_error: null, updated_at: now() })
      .eq('id', connection.id)

    return {
      binding_id: binding.id,
      merchant,
      received: events.length,
      acknowledged: acknowledgments.length,
      results,
    }
  } catch (error) {
    const message = String((error as any)?.message || error)
    await admin
      .from('brand_integration_bindings')
      .update({
        last_sync_at: now(),
        last_error_at: now(),
        last_error: message.slice(0, 800),
        updated_at: now(),
      })
      .eq('id', binding.id)
    await admin
      .from('integration_connections')
      .update({
        status: 'degraded',
        last_error_at: now(),
        last_error: message.slice(0, 800),
        updated_at: now(),
      })
      .eq('id', connection.id)
    return { binding_id: binding.id, error: message }
  }
}

async function pollAll(req: Request) {
  if (!(await workerAuthorized(req))) return json(req, { detail: 'Worker não autorizado' }, 401)
  const bindings = await admin
    .from('brand_integration_bindings')
    .select('*')
    .eq('provider', 'ifood')
    .eq('active', true)
    .eq('order_import_enabled', true)
    .order('last_sync_at', { ascending: true, nullsFirst: true })
    .limit(12)
  if (bindings.error) return json(req, { detail: 'Falha ao carregar vínculos iFood' }, 500)

  const results: any[] = []
  for (const binding of bindings.data || []) results.push(await pollBinding(binding))
  return json(req, {
    ok: true,
    service: SLUG,
    version: VERSION,
    processed_bindings: results.length,
    results,
  })
}

async function tenantAction(req: Request, businessId: number, orderId: number, action: string) {
  const user: any = await auth(req)
  if (!user || !(await member(user.id, businessId, true))) {
    return json(req, { detail: 'Sem acesso' }, 403)
  }

  const order = await admin
    .from('orders')
    .select('id,business_id,brand_id,source,idempotency_key,status')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (order.error || !order.data || order.data.source !== 'ifood') {
    return json(req, { detail: 'Pedido iFood não encontrado' }, 404)
  }

  const externalOrderId = String(order.data.idempotency_key || '').replace(/^ifood:/, '')
  if (!externalOrderId) return json(req, { detail: 'Referência externa ausente' }, 409)

  const binding = await admin
    .from('brand_integration_bindings')
    .select('*')
    .eq('business_id', businessId)
    .eq('brand_id', order.data.brand_id)
    .eq('provider', 'ifood')
    .eq('active', true)
    .eq('order_import_enabled', true)
    .limit(1)
    .maybeSingle()
  if (binding.error || !binding.data) {
    return json(req, { detail: 'Loja iFood não vinculada à marca deste pedido' }, 409)
  }

  const connection = await admin
    .from('integration_connections')
    .select('*')
    .eq('id', binding.data.connection_id)
    .eq('status', 'active')
    .maybeSingle()
  if (connection.error || !connection.data) {
    return json(req, { detail: 'Conexão iFood indisponível' }, 409)
  }

  let cred = await credential(connection.data.id)
  if (!cred) return json(req, { detail: 'Credencial iFood ausente' }, 409)

  try {
    cred = await ensureFresh(connection.data, cred)
    const paths: Record<string, string> = {
      confirm: 'confirm',
      startPreparation: 'startPreparation',
      readyToPickup: 'readyToPickup',
      dispatch: 'dispatch',
    }
    if (!paths[action]) return json(req, { detail: 'Ação iFood inválida' }, 422)

    const body = action === 'dispatch' ? JSON.stringify({ deliveredBy: 'MERCHANT' }) : undefined
    const response = await fetch(
      `https://merchant-api.ifood.com.br/order/v1.0/orders/${encodeURIComponent(externalOrderId)}/${paths[action]}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cred.secret.accessToken}`,
          'content-type': 'application/json',
        },
        body,
      },
    )
    const remote = await response.json().catch(() => ({}))
    if (response.status !== 202 && !response.ok) {
      throw new HttpError(
        response.status,
        String(remote?.message || remote?.error || 'iFood recusou a ação'),
        remote,
      )
    }

    await admin.from('audit_logs').insert({
      business_id: businessId,
      actor_user_id: user.id,
      action: `ifood.${action}`,
      entity_type: 'order',
      entity_id: String(orderId),
      payload_json: JSON.stringify({
        external_order_id: externalOrderId,
        http_status: response.status,
      }),
    })

    return json(
      req,
      {
        ok: true,
        accepted: true,
        http_status: response.status,
        action,
        order_id: orderId,
        external_order_id: externalOrderId,
        note: 'O estado local será atualizado quando o evento de confirmação chegar do iFood.',
      },
      202,
    )
  } catch (error) {
    return json(req, { detail: String((error as any)?.message || error) }, (error as any)?.status || 502)
  }
}

Deno.serve(async (req: Request) => {
  const path = routePath(req)

  if (req.method === 'GET' && path === '/health') {
    return json(req, {
      ok: true,
      service: SLUG,
      version: VERSION,
      mode: 'distributed_polling',
      interval_seconds: 30,
    })
  }

  if (req.method === 'POST' && path === '/poll') return pollAll(req)

  const actionMatch = path.match(
    /^\/businesses\/(\d+)\/orders\/(\d+)\/ifood\/(confirm|startPreparation|readyToPickup|dispatch)$/,
  )
  if (req.method === 'POST' && actionMatch) {
    return tenantAction(req, Number(actionMatch[1]), Number(actionMatch[2]), actionMatch[3])
  }

  return json(req, { detail: 'Rota não encontrada' }, 404)
})
