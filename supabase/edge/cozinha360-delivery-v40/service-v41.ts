import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTION_SLUG = 'cozinha360-delivery-v40'
const PUBLIC_APP = (Deno.env.get('C360_PUBLIC_APP_URL') || 'https://cozinha-360-os.netlify.app').replace(/\/$/, '')

const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const allowedOrigins = new Set([PUBLIC_APP, 'http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'])

function cors(req: Request) {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : PUBLIC_APP,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
}
const reply = (req: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors(req) })
const fail = (req: Request, detail: string, status = 400, extra: Record<string, unknown> = {}) => reply(req, { detail, ...extra }, status)
const now = () => new Date().toISOString()
const text = (v: unknown, max = 180) => String(v ?? '').trim().slice(0, max)
const int = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback }
const positiveId = (v: unknown) => Math.max(0, int(v))
const bool = (v: unknown, fallback = false) => v === undefined ? fallback : Boolean(v)
const iso = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString() }
const slug = (v: unknown) => text(v, 90).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
async function body(req: Request) { try { return await req.json() } catch { return {} } }
function routePath(req: Request) { const p = new URL(req.url).pathname; const marker = '/' + FUNCTION_SLUG; const i = p.indexOf(marker); return i >= 0 ? (p.slice(i + marker.length) || '/') : p }

async function auth(req: Request) {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) return null
  let profile = (await admin.from('users').select('id,email,full_name').eq('auth_user_id', data.user.id).maybeSingle()).data
  if (!profile && data.user.email) profile = (await admin.from('users').select('id,email,full_name').ilike('email', data.user.email).maybeSingle()).data
  return profile || null
}
async function member(userId: number, businessId: number, write = false) {
  const row = (await admin.from('memberships').select('id,role').eq('user_id', userId).eq('business_id', businessId).maybeSingle()).data
  if (!row) return null
  if (write && !['owner', 'admin'].includes(row.role)) return null
  return row
}
async function audit(businessId: number, userId: number, action: string, entityType: string, entityId: string, payload: unknown) {
  await admin.from('audit_logs').insert({ business_id: businessId, actor_user_id: userId, action, entity_type: entityType, entity_id: entityId, payload_json: JSON.stringify(payload ?? {}) })
}
async function brandExists(businessId: number, brandId: number | null) {
  if (!brandId) return true
  return Boolean((await admin.from('brands').select('id').eq('business_id', businessId).eq('id', brandId).eq('soft_deleted', false).maybeSingle()).data)
}
async function driverExists(businessId: number, driverId: number | null) {
  if (!driverId) return true
  return Boolean((await admin.from('delivery_drivers').select('id').eq('business_id', businessId).eq('id', driverId).eq('active', true).maybeSingle()).data)
}
async function zoneExists(businessId: number, zoneId: number | null) {
  if (!zoneId) return true
  return Boolean((await admin.from('delivery_zones').select('id').eq('business_id', businessId).eq('id', zoneId).eq('active', true).maybeSingle()).data)
}

async function overview(req: Request, businessId: number) {
  const [business, brands, channels, orders, items, customers, zones, drivers, deliveries, loyalty, promos, stores, connections, billing, plans, settings, profiles, routes, stops, ledger] = await Promise.all([
    admin.from('businesses').select('id,name,city,currency').eq('id', businessId).single(),
    admin.from('brands').select('id,business_id,name,active,soft_deleted,slug,primary_channel,sort_order').eq('business_id', businessId).eq('soft_deleted', false).order('sort_order').order('id'),
    admin.from('channels').select('id,name,fee_bps,fixed_fee_cents,delivery_cents,promo_cents,media_cents,traffic_active').eq('business_id', businessId).order('id'),
    admin.from('orders').select('id,brand_id,channel_id,customer_id,status,source,total_cents,variable_cost_cents,contribution_cents,paid,delayed,error_flag,version,created_at,updated_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(180),
    admin.from('order_items').select('id,order_id,product_id,quantity,unit_price_cents,unit_variable_cost_cents').eq('business_id', businessId).order('id'),
    admin.from('customers').select('id,name,phone,email,consent_marketing,opted_out_at,created_at').eq('business_id', businessId).order('id'),
    admin.from('delivery_zones').select('*').eq('business_id', businessId).order('active', { ascending: false }).order('id'),
    admin.from('delivery_drivers').select('*').eq('business_id', businessId).order('active', { ascending: false }).order('id'),
    admin.from('deliveries').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(180),
    admin.from('loyalty_programs').select('*').eq('business_id', businessId).maybeSingle(),
    admin.from('delivery_promos').select('*').eq('business_id', businessId).order('active', { ascending: false }).order('id'),
    admin.from('storefronts').select('id,business_id,brand_id,channel_id,slug,display_name,active').eq('business_id', businessId).order('id'),
    admin.from('integration_connections').select('id,provider,display_name,status,mode,last_success_at,last_error_at,last_error').eq('business_id', businessId).order('provider'),
    admin.from('business_billing_accounts').select('plan_key,status,current_period_end,cancel_at_period_end').eq('business_id', businessId).maybeSingle(),
    admin.from('commercial_plans').select('*').eq('active', true).order('sort_order'),
    admin.from('delivery_settings').select('*').eq('business_id', businessId).maybeSingle(),
    admin.from('customer_brand_profiles').select('*').eq('business_id', businessId).order('last_order_at', { ascending: false }).limit(300),
    admin.from('delivery_route_batches').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(80),
    admin.from('delivery_route_stops').select('*').eq('business_id', businessId).order('route_batch_id').order('stop_order'),
    admin.from('delivery_driver_ledger').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(500),
  ])
  if (business.error) return fail(req, 'Operação não encontrada', 404)
  const errors = [brands.error, channels.error, orders.error, items.error, customers.error, zones.error, drivers.error, deliveries.error, promos.error, stores.error, connections.error, plans.error, profiles.error, routes.error, stops.error, ledger.error].filter(Boolean)
  if (errors.length) { console.error('delivery overview', errors); return fail(req, 'Não foi possível montar o Delivery 360', 500) }

  const brandRows = brands.data || [], channelRows = channels.data || [], orderRows = orders.data || [], customerRows = customers.data || [], deliveryRows = deliveries.data || []
  const itemMap = new Map<number, any[]>(); for (const x of items.data || []) { const list = itemMap.get(Number(x.order_id)) || []; list.push(x); itemMap.set(Number(x.order_id), list) }
  const customerMap = new Map(customerRows.map(x => [Number(x.id), x]))
  const channelMap = new Map(channelRows.map(x => [Number(x.id), x]))
  const brandMap = new Map(brandRows.map(x => [Number(x.id), x]))
  const deliveryMap = new Map(deliveryRows.map(x => [Number(x.order_id), x]))
  const enrichedOrders = orderRows.map(x => ({ ...x, items: itemMap.get(Number(x.id)) || [], customer: x.customer_id ? customerMap.get(Number(x.customer_id)) || null : null, channel: x.channel_id ? channelMap.get(Number(x.channel_id)) || null : null, brand: x.brand_id ? brandMap.get(Number(x.brand_id)) || null : null, delivery: deliveryMap.get(Number(x.id)) || null }))
  const activeOrderStatuses = new Set(['new', 'confirmed', 'production', 'checking', 'awaiting_delivery'])
  const open = enrichedOrders.filter(x => activeOrderStatuses.has(String(x.status)))
  const paid = orderRows.filter(x => x.paid)
  const brandStats = brandRows.map(b => { const rows = orderRows.filter(o => Number(o.brand_id) === Number(b.id)); const done = rows.filter(o => o.paid); return { brand_id: b.id, orders: rows.length, open_orders: rows.filter(o => activeOrderStatuses.has(String(o.status))).length, revenue_cents: done.reduce((s, o) => s + int(o.total_cents), 0), contribution_cents: done.reduce((s, o) => s + int(o.contribution_cents), 0) } })
  const stopMap = new Map<number, any[]>(); for (const s of stops.data || []) { const list = stopMap.get(Number(s.route_batch_id)) || []; list.push(s); stopMap.set(Number(s.route_batch_id), list) }
  const routeRows = (routes.data || []).map(r => ({ ...r, stops: stopMap.get(Number(r.id)) || [] }))
  const balance = new Map<number, number>(); for (const e of ledger.data || []) balance.set(Number(e.driver_id), (balance.get(Number(e.driver_id)) || 0) + int(e.amount_cents))
  const driverLedgerSummary = (drivers.data || []).map(d => ({ driver_id: d.id, name: d.name, balance_cents: balance.get(Number(d.id)) || 0, entries: (ledger.data || []).filter(e => Number(e.driver_id) === Number(d.id)).length }))
  const brandProfiles = (profiles.data || []).map(p => ({ ...p, customer: customerMap.get(Number(p.customer_id)) || null, brand: brandMap.get(Number(p.brand_id)) || null }))
  const planCatalog = plans.data || []
  const planKey = String(billing.data?.plan_key || 'start').toLowerCase()
  const selectedPlan = planCatalog.find((p: any) => p.plan_key === planKey) || planCatalog.find((p: any) => p.plan_key === 'start') || null
  const cfg = settings.data || { business_id: businessId, scheduled_orders_enabled: true, auto_accept_direct_orders: false, route_provider: 'manual', route_optimization_enabled: false, customer_tracking_enabled: false, whatsapp_status_updates: false, brand_crm_isolation: true, prep_target_min: 25, default_eta_min: 45, sla_warning_minutes: 10, max_scheduled_days: 7 }
  const terminal = new Set(['delivered', 'cancelled', 'failed'])
  const scheduled = deliveryRows.filter(d => d.scheduled_for && new Date(d.scheduled_for).getTime() > Date.now() && !terminal.has(String(d.status)))
  const inTransit = deliveryRows.filter(d => ['assigned', 'picked_up'].includes(String(d.status)))
  const overdue = deliveryRows.filter(d => d.promised_at && new Date(d.promised_at).getTime() < Date.now() && !terminal.has(String(d.status)))

  return reply(req, {
    version: '4.1.1', business: business.data,
    summary: { open_orders: open.length, delayed_orders: open.filter(o => o.delayed).length, paid_orders: paid.length, revenue_cents: paid.reduce((s, o) => s + int(o.total_cents), 0), contribution_cents: paid.reduce((s, o) => s + int(o.contribution_cents), 0), available_drivers: (drivers.data || []).filter(d => d.active && d.status === 'available').length, active_zones: (zones.data || []).filter(z => z.active).length, scheduled_deliveries: scheduled.length, in_transit: inTransit.length, overdue_deliveries: overdue.length, open_routes: routeRows.filter(r => ['draft', 'ready', 'dispatched'].includes(String(r.status))).length },
    plan: { key: planKey, status: billing.data?.status || 'observe_only', brand_limit: Number(selectedPlan?.brand_limit || 1), driver_limit: selectedPlan?.driver_limit ?? null, route_quota: selectedPlan?.route_quota ?? 0, current_period_end: billing.data?.current_period_end || null, cancel_at_period_end: Boolean(billing.data?.cancel_at_period_end), enforcement: billing.data?.status === 'active' ? 'active' : 'observe_only' },
    plan_catalog: planCatalog, settings: cfg, brands: brandRows, brand_stats: brandStats, channels: channelRows, orders: enrichedOrders, zones: zones.data || [], drivers: drivers.data || [], deliveries: deliveryRows,
    loyalty: loyalty.data || { business_id: businessId, mode: 'off', points_per_real: 1, cashback_bps: 0, redeem_threshold: 0, active: false }, promos: promos.data || [], storefronts: stores.data || [], connections: connections.data || [], customer_brand_profiles: brandProfiles, routes: routeRows, driver_ledger: ledger.data || [], driver_ledger_summary: driverLedgerSummary,
  })
}

async function createBrand(req: Request, businessId: number, userId: number, p: any) {
  const name = text(p.name, 120), s = slug(p.slug || name)
  if (name.length < 2 || !s) return fail(req, 'Informe um nome de marca válido')
  const r = await admin.from('brands').insert({ business_id: businessId, name, slug: s, primary_channel: text(p.primary_channel || 'direct', 32) || 'direct', sort_order: int(p.sort_order), active: p.active !== false, soft_deleted: false }).select('*').single()
  if (r.error) return fail(req, r.error.code === '23505' ? 'Já existe uma marca com esse nome ou slug.' : 'Não foi possível criar a marca', r.error.code === '23505' ? 409 : 400)
  await audit(businessId, userId, 'create', 'brand', String(r.data.id), { name, slug: s }); return reply(req, { brand: r.data }, 201)
}
async function patchBrand(req: Request, businessId: number, userId: number, brandId: number, p: any) {
  const current = (await admin.from('brands').select('*').eq('business_id', businessId).eq('id', brandId).eq('soft_deleted', false).maybeSingle()).data
  if (!current) return fail(req, 'Marca não encontrada', 404)
  const patch: any = {}; if (p.name !== undefined) patch.name = text(p.name, 120); if (p.slug !== undefined) patch.slug = slug(p.slug); if (p.active !== undefined) patch.active = Boolean(p.active); if (p.primary_channel !== undefined) patch.primary_channel = text(p.primary_channel, 32) || 'direct'; if (p.sort_order !== undefined) patch.sort_order = int(p.sort_order); if (p.soft_deleted === true) { patch.soft_deleted = true; patch.active = false }
  const r = await admin.from('brands').update(patch).eq('business_id', businessId).eq('id', brandId).select('*').single(); if (r.error) return fail(req, r.error.code === '23505' ? 'Slug já utilizado.' : 'Não foi possível atualizar a marca', r.error.code === '23505' ? 409 : 400)
  await audit(businessId, userId, 'update', 'brand', String(brandId), patch); return reply(req, { brand: r.data })
}

async function createZone(req: Request, businessId: number, userId: number, p: any) {
  const zoneType = text(p.zone_type || 'neighborhood', 24); if (!['radius', 'neighborhood', 'cep'].includes(zoneType)) return fail(req, 'Tipo de zona inválido')
  const brandId = positiveId(p.brand_id) || null; if (!await brandExists(businessId, brandId)) return fail(req, 'Marca inválida', 404)
  const radius = p.radius_km == null ? null : Number(p.radius_km), lat = p.center_lat == null ? null : Number(p.center_lat), lng = p.center_lng == null ? null : Number(p.center_lng)
  if (zoneType === 'radius' && (!Number.isFinite(radius) || Number(radius) <= 0 || !Number.isFinite(lat) || Number(lat) < -90 || Number(lat) > 90 || !Number.isFinite(lng) || Number(lng) < -180 || Number(lng) > 180)) return fail(req, 'Zona por raio exige latitude, longitude e raio válidos.')
  const row = { business_id: businessId, brand_id: brandId, name: text(p.name, 120), zone_type: zoneType, match_value: text(p.match_value, 180), fee_cents: Math.max(0, int(p.fee_cents)), min_order_cents: Math.max(0, int(p.min_order_cents)), free_delivery_over_cents: Math.max(0, int(p.free_delivery_over_cents)), eta_min: Math.min(360, Math.max(5, int(p.eta_min, 45))), center_lat: lat, center_lng: lng, radius_km: radius, active: p.active !== false, version: 1 }
  if (!row.name) return fail(req, 'Informe o nome da zona')
  const r = await admin.from('delivery_zones').insert(row).select('*').single(); if (r.error) return fail(req, 'Não foi possível criar a zona', 400)
  await audit(businessId, userId, 'create', 'delivery_zone', String(r.data.id), row); return reply(req, { zone: r.data }, 201)
}
async function patchZone(req: Request, businessId: number, userId: number, zoneId: number, p: any) {
  const current = (await admin.from('delivery_zones').select('*').eq('business_id', businessId).eq('id', zoneId).maybeSingle()).data; if (!current) return fail(req, 'Zona não encontrada', 404)
  if (p.version !== undefined && int(p.version) !== int(current.version)) return fail(req, 'Zona foi alterada em outra sessão.', 409, { code: 'VERSION_CONFLICT' })
  const patch: any = { version: int(current.version) + 1 }; if (p.name !== undefined) patch.name = text(p.name, 120); if (p.zone_type !== undefined) { const t = text(p.zone_type, 24); if (!['radius', 'neighborhood', 'cep'].includes(t)) return fail(req, 'Tipo de zona inválido'); patch.zone_type = t } if (p.match_value !== undefined) patch.match_value = text(p.match_value, 180); if (p.fee_cents !== undefined) patch.fee_cents = Math.max(0, int(p.fee_cents)); if (p.min_order_cents !== undefined) patch.min_order_cents = Math.max(0, int(p.min_order_cents)); if (p.free_delivery_over_cents !== undefined) patch.free_delivery_over_cents = Math.max(0, int(p.free_delivery_over_cents)); if (p.eta_min !== undefined) patch.eta_min = Math.min(360, Math.max(5, int(p.eta_min))); if (p.active !== undefined) patch.active = Boolean(p.active); if (p.center_lat !== undefined) patch.center_lat = p.center_lat == null ? null : Number(p.center_lat); if (p.center_lng !== undefined) patch.center_lng = p.center_lng == null ? null : Number(p.center_lng); if (p.radius_km !== undefined) patch.radius_km = p.radius_km == null ? null : Number(p.radius_km)
  const r = await admin.from('delivery_zones').update(patch).eq('business_id', businessId).eq('id', zoneId).eq('version', current.version).select('*').maybeSingle(); if (r.error || !r.data) return fail(req, 'Conflito ao salvar zona', 409)
  await audit(businessId, userId, 'update', 'delivery_zone', String(zoneId), patch); return reply(req, { zone: r.data })
}

async function createDriver(req: Request, businessId: number, userId: number, p: any) {
  const vehicle = text(p.vehicle || 'moto', 20), status = text(p.status || 'offline', 20); if (!['foot', 'bike', 'moto', 'car', 'utility'].includes(vehicle) || !['available', 'busy', 'offline'].includes(status)) return fail(req, 'Veículo ou status inválido')
  const row = { business_id: businessId, name: text(p.name, 120), phone: text(p.phone, 40), vehicle, status, active: p.active !== false, version: 1 }; if (!row.name) return fail(req, 'Informe o nome do entregador')
  const r = await admin.from('delivery_drivers').insert(row).select('*').single(); if (r.error) return fail(req, 'Não foi possível adicionar o entregador', 400)
  await audit(businessId, userId, 'create', 'delivery_driver', String(r.data.id), { name: r.data.name, vehicle, status }); return reply(req, { driver: r.data }, 201)
}
async function patchDriver(req: Request, businessId: number, userId: number, driverId: number, p: any) {
  const current = (await admin.from('delivery_drivers').select('*').eq('business_id', businessId).eq('id', driverId).maybeSingle()).data; if (!current) return fail(req, 'Entregador não encontrado', 404)
  if (p.version !== undefined && int(p.version) !== int(current.version)) return fail(req, 'Entregador foi alterado em outra sessão.', 409, { code: 'VERSION_CONFLICT' })
  const patch: any = { version: int(current.version) + 1 }; if (p.name !== undefined) patch.name = text(p.name, 120); if (p.phone !== undefined) patch.phone = text(p.phone, 40); if (p.vehicle !== undefined) { const v = text(p.vehicle, 20); if (!['foot', 'bike', 'moto', 'car', 'utility'].includes(v)) return fail(req, 'Veículo inválido'); patch.vehicle = v } if (p.status !== undefined) { const s = text(p.status, 20); if (!['available', 'busy', 'offline'].includes(s)) return fail(req, 'Status inválido'); patch.status = s } if (p.active !== undefined) patch.active = Boolean(p.active)
  const r = await admin.from('delivery_drivers').update(patch).eq('business_id', businessId).eq('id', driverId).eq('version', current.version).select('*').maybeSingle(); if (r.error || !r.data) return fail(req, 'Conflito ao salvar entregador', 409)
  await audit(businessId, userId, 'update', 'delivery_driver', String(driverId), patch); return reply(req, { driver: r.data })
}

async function saveDelivery(req: Request, businessId: number, userId: number, orderId: number, p: any) {
  const order = (await admin.from('orders').select('id').eq('business_id', businessId).eq('id', orderId).maybeSingle()).data; if (!order) return fail(req, 'Pedido não encontrado', 404)
  const driverId = positiveId(p.driver_id) || null, zoneId = positiveId(p.zone_id) || null; if (!await driverExists(businessId, driverId)) return fail(req, 'Entregador inválido', 404); if (!await zoneExists(businessId, zoneId)) return fail(req, 'Zona inválida', 404)
  const status = text(p.status || (driverId ? 'assigned' : 'waiting'), 24); if (!['waiting', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled'].includes(status)) return fail(req, 'Status de entrega inválido')
  const current = (await admin.from('deliveries').select('*').eq('business_id', businessId).eq('order_id', orderId).maybeSingle()).data; if (current && p.version !== undefined && int(p.version) !== int(current.version)) return fail(req, 'Entrega foi atualizada em outra sessão.', 409, { code: 'VERSION_CONFLICT' })
  const row: any = { business_id: businessId, order_id: orderId, driver_id: driverId, zone_id: zoneId, status, fee_cents: Math.max(0, int(p.fee_cents, current?.fee_cents || 0)), driver_payout_cents: Math.max(0, int(p.driver_payout_cents, current?.driver_payout_cents || 0)), promised_at: p.promised_at !== undefined ? iso(p.promised_at) : current?.promised_at || null, scheduled_for: p.scheduled_for !== undefined ? iso(p.scheduled_for) : current?.scheduled_for || null, address_line: p.address_line !== undefined ? text(p.address_line, 300) : current?.address_line || null, neighborhood: p.neighborhood !== undefined ? text(p.neighborhood, 120) : current?.neighborhood || null, postal_code: p.postal_code !== undefined ? text(p.postal_code, 20) : current?.postal_code || null, address_reference: p.address_reference !== undefined ? text(p.address_reference, 220) : current?.address_reference || null, notes: text(p.notes ?? current?.notes ?? '', 1000), version: current ? int(current.version) + 1 : 1 }
  if (status === 'picked_up' && !current?.picked_up_at) row.picked_up_at = now(); if (status === 'delivered' && !current?.delivered_at) row.delivered_at = now(); if (p.ready_at !== undefined) row.ready_at = iso(p.ready_at)
  const saved = current ? await admin.from('deliveries').update(row).eq('id', current.id).eq('business_id', businessId).eq('version', current.version).select('*').maybeSingle() : await admin.from('deliveries').insert(row).select('*').single()
  if (saved.error || !saved.data) return fail(req, 'Não foi possível salvar a entrega', current ? 409 : 400)
  if (driverId && ['assigned', 'picked_up', 'delivered'].includes(status)) { const d = (await admin.from('delivery_drivers').select('version').eq('business_id', businessId).eq('id', driverId).maybeSingle()).data; if (d) await admin.from('delivery_drivers').update({ status: status === 'delivered' ? 'available' : 'busy', version: int(d.version) + 1 }).eq('business_id', businessId).eq('id', driverId).eq('version', d.version) }
  if (status === 'delivered' && driverId && int(saved.data.driver_payout_cents) > 0) await admin.from('delivery_driver_ledger').upsert({ business_id: businessId, driver_id: driverId, delivery_id: saved.data.id, entry_type: 'delivery_fee', amount_cents: int(saved.data.driver_payout_cents), note: `Entrega #${orderId}`, created_by_user_id: userId }, { onConflict: 'delivery_id,entry_type', ignoreDuplicates: true })
  await audit(businessId, userId, current ? 'update' : 'create', 'delivery', String(saved.data.id), { order_id: orderId, driver_id: driverId, zone_id: zoneId, status, fee_cents: saved.data.fee_cents, driver_payout_cents: saved.data.driver_payout_cents }); return reply(req, { delivery: saved.data }, current ? 200 : 201)
}

async function saveSettings(req: Request, businessId: number, userId: number, p: any) {
  const provider = text(p.route_provider || 'manual', 24); if (!['manual', 'google', 'mapbox', 'external'].includes(provider)) return fail(req, 'Provedor de rota inválido')
  const row = { business_id: businessId, scheduled_orders_enabled: bool(p.scheduled_orders_enabled, true), auto_accept_direct_orders: bool(p.auto_accept_direct_orders, false), route_provider: provider, route_optimization_enabled: bool(p.route_optimization_enabled, false), customer_tracking_enabled: bool(p.customer_tracking_enabled, false), whatsapp_status_updates: bool(p.whatsapp_status_updates, false), brand_crm_isolation: p.brand_crm_isolation === undefined ? true : Boolean(p.brand_crm_isolation), prep_target_min: Math.min(240, Math.max(5, int(p.prep_target_min, 25))), default_eta_min: Math.min(360, Math.max(10, int(p.default_eta_min, 45))), sla_warning_minutes: Math.min(120, Math.max(1, int(p.sla_warning_minutes, 10))), max_scheduled_days: Math.min(60, Math.max(0, int(p.max_scheduled_days, 7))), updated_by_user_id: userId, updated_at: now() }
  if (row.route_optimization_enabled && provider === 'manual') return fail(req, 'Conecte um provedor de mapas antes de ativar otimização automática.', 409, { code: 'ROUTE_PROVIDER_REQUIRED' })
  const r = await admin.from('delivery_settings').upsert(row, { onConflict: 'business_id' }).select('*').single(); if (r.error) return fail(req, 'Não foi possível salvar as configurações', 400)
  await audit(businessId, userId, 'update', 'delivery_settings', String(businessId), row); return reply(req, { settings: r.data })
}

async function createRoute(req: Request, businessId: number, userId: number, p: any) {
  const ids = Array.from(new Set((Array.isArray(p.delivery_ids) ? p.delivery_ids : []).map((x: any) => positiveId(x)).filter(Boolean))).slice(0, 30) as number[]
  if (!ids.length) return fail(req, 'Selecione ao menos uma entrega.')
  const driverId = positiveId(p.driver_id) || null, zoneId = positiveId(p.zone_id) || null; if (!await driverExists(businessId, driverId)) return fail(req, 'Entregador inválido', 404); if (!await zoneExists(businessId, zoneId)) return fail(req, 'Zona inválida', 404)
  if (p.optimize === true) return fail(req, 'Otimização automática só é liberada após conexão e validação de um provedor de mapas.', 409, { code: 'MAP_PROVIDER_NOT_CONNECTED' })
  const deliveries = await admin.from('deliveries').select('*').eq('business_id', businessId).in('id', ids); if (deliveries.error) throw deliveries.error; if ((deliveries.data || []).length !== ids.length) return fail(req, 'Uma ou mais entregas não pertencem a esta operação.', 404); if ((deliveries.data || []).some(d => ['delivered', 'cancelled', 'failed'].includes(String(d.status)))) return fail(req, 'Entregas concluídas ou canceladas não podem entrar em nova rota.', 409)
  const batch = await admin.from('delivery_route_batches').insert({ business_id: businessId, zone_id: zoneId, driver_id: driverId, provider: 'manual', status: 'ready', version: 1 }).select('*').single(); if (batch.error) return fail(req, 'Não foi possível criar a rota', 400)
  const map = new Map((deliveries.data || []).map(d => [Number(d.id), d])); const rows = ids.map((deliveryId, index) => { const d: any = map.get(deliveryId); return { business_id: businessId, route_batch_id: batch.data.id, delivery_id: deliveryId, stop_order: index + 1, status: 'pending', address_snapshot: [d?.address_line, d?.neighborhood, d?.postal_code].filter(Boolean).join(' · ').slice(0, 300) || null, latitude: d?.latitude || null, longitude: d?.longitude || null } })
  const stops = await admin.from('delivery_route_stops').insert(rows).select('*'); if (stops.error) { await admin.from('delivery_route_batches').delete().eq('id', batch.data.id).eq('business_id', businessId); return fail(req, 'Não foi possível montar as paradas da rota', 400) }
  if (driverId) await admin.from('deliveries').update({ driver_id: driverId, status: 'assigned' }).eq('business_id', businessId).in('id', ids)
  await audit(businessId, userId, 'create', 'delivery_route', String(batch.data.id), { delivery_ids: ids, driver_id: driverId, zone_id: zoneId, provider: 'manual' }); return reply(req, { route: { ...batch.data, stops: stops.data || [] } }, 201)
}
async function patchRoute(req: Request, businessId: number, userId: number, routeId: number, p: any) {
  const current = (await admin.from('delivery_route_batches').select('*').eq('business_id', businessId).eq('id', routeId).maybeSingle()).data; if (!current) return fail(req, 'Rota não encontrada', 404); if (p.version !== undefined && int(p.version) !== int(current.version)) return fail(req, 'Rota alterada em outra sessão.', 409, { code: 'VERSION_CONFLICT' })
  const patch: any = { version: int(current.version) + 1 }; if (p.driver_id !== undefined) { const d = positiveId(p.driver_id) || null; if (!await driverExists(businessId, d)) return fail(req, 'Entregador inválido', 404); patch.driver_id = d } if (p.status !== undefined) { const s = text(p.status, 24); if (!['draft', 'ready', 'dispatched', 'completed', 'cancelled'].includes(s)) return fail(req, 'Status de rota inválido'); patch.status = s; if (s === 'dispatched' && !current.started_at) patch.started_at = now(); if (s === 'completed' && !current.completed_at) patch.completed_at = now() }
  const r = await admin.from('delivery_route_batches').update(patch).eq('business_id', businessId).eq('id', routeId).eq('version', current.version).select('*').maybeSingle(); if (r.error || !r.data) return fail(req, 'Conflito ao salvar rota', 409)
  await audit(businessId, userId, 'update', 'delivery_route', String(routeId), patch); return reply(req, { route: r.data })
}
async function createLedger(req: Request, businessId: number, userId: number, p: any) {
  const driverId = positiveId(p.driver_id); if (!driverId || !await driverExists(businessId, driverId)) return fail(req, 'Entregador inválido', 404)
  const entryType = text(p.entry_type, 24); if (!['adjustment', 'payment'].includes(entryType)) return fail(req, 'Use adjustment ou payment para lançamentos manuais.')
  let amount = int(p.amount_cents); if (!amount) return fail(req, 'Valor precisa ser diferente de zero.'); if (entryType === 'payment') amount = -Math.abs(amount)
  const row = { business_id: businessId, driver_id: driverId, delivery_id: null, entry_type: entryType, amount_cents: amount, note: text(p.note, 300), created_by_user_id: userId }; const r = await admin.from('delivery_driver_ledger').insert(row).select('*').single(); if (r.error) return fail(req, 'Não foi possível registrar o acerto', 400)
  await audit(businessId, userId, 'create', 'delivery_driver_ledger', String(r.data.id), row); return reply(req, { entry: r.data }, 201)
}
async function patchCustomerBrand(req: Request, businessId: number, userId: number, profileId: number, p: any) {
  const current = (await admin.from('customer_brand_profiles').select('*').eq('business_id', businessId).eq('id', profileId).maybeSingle()).data; if (!current) return fail(req, 'Perfil de marca não encontrado', 404)
  const patch: any = {}; if (p.consent_marketing !== undefined) { patch.consent_marketing = Boolean(p.consent_marketing); patch.opted_out_at = patch.consent_marketing ? null : now() } if (p.opt_out === true) { patch.consent_marketing = false; patch.opted_out_at = now() } if (!Object.keys(patch).length) return fail(req, 'Nenhuma alteração informada.')
  const r = await admin.from('customer_brand_profiles').update(patch).eq('business_id', businessId).eq('id', profileId).select('*').single(); if (r.error) return fail(req, 'Não foi possível atualizar o consentimento', 400)
  await audit(businessId, userId, 'update', 'customer_brand_profile', String(profileId), { ...patch, brand_id: current.brand_id, customer_id: current.customer_id }); return reply(req, { profile: r.data })
}
async function saveLoyalty(req: Request, businessId: number, userId: number, p: any) {
  const mode = text(p.mode || 'off', 20); if (!['off', 'points', 'cashback'].includes(mode)) return fail(req, 'Modo de fidelidade inválido')
  const points = Math.max(0, Number(p.points_per_real ?? 1)); if (!Number.isFinite(points)) return fail(req, 'Pontuação inválida')
  const row = { business_id: businessId, mode, points_per_real: points, cashback_bps: Math.min(5000, Math.max(0, int(p.cashback_bps))), redeem_threshold: Math.max(0, int(p.redeem_threshold)), active: Boolean(p.active) && mode !== 'off', updated_by_user_id: userId, updated_at: now() }; const r = await admin.from('loyalty_programs').upsert(row, { onConflict: 'business_id' }).select('*').single(); if (r.error) return fail(req, 'Não foi possível salvar fidelidade', 400)
  await audit(businessId, userId, 'update', 'loyalty_program', String(businessId), row); return reply(req, { loyalty: r.data })
}
async function createPromo(req: Request, businessId: number, userId: number, p: any) {
  const kind = text(p.discount_type, 24); if (!['percent', 'fixed', 'free_delivery'].includes(kind)) return fail(req, 'Tipo de cupom inválido')
  const brandId = positiveId(p.brand_id) || null; if (!await brandExists(businessId, brandId)) return fail(req, 'Marca inválida', 404)
  const code = text(p.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, ''); if (code.length < 3) return fail(req, 'Código precisa ter ao menos 3 caracteres')
  const row = { business_id: businessId, brand_id: brandId, code, discount_type: kind, value: Math.max(0, int(p.value)), min_order_cents: Math.max(0, int(p.min_order_cents)), max_uses: positiveId(p.max_uses) || null, starts_at: iso(p.starts_at), ends_at: iso(p.ends_at), active: p.active !== false }; const r = await admin.from('delivery_promos').insert(row).select('*').single(); if (r.error) return fail(req, r.error.code === '23505' ? 'Cupom já existe.' : 'Não foi possível criar o cupom', r.error.code === '23505' ? 409 : 400)
  await audit(businessId, userId, 'create', 'delivery_promo', String(r.data.id), { code, discount_type: kind, value: row.value }); return reply(req, { promo: r.data }, 201)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  const path = routePath(req), method = req.method
  if (path === '/health' && method === 'GET') return reply(req, { status: 'ok', service: FUNCTION_SLUG, version: '4.1.1', capabilities: ['multi_brand', 'direct_quote', 'scheduled_orders', 'manual_routes', 'driver_settlement', 'brand_crm', 'commercial_plans'] })
  const user = await auth(req); if (!user) return fail(req, 'Sessão inválida ou expirada', 401)
  const match = path.match(/^\/businesses\/(\d+)(?:\/(.*))?$/); if (!match) return fail(req, 'Rota não encontrada', 404)
  const businessId = positiveId(match[1]); if (!businessId) return fail(req, 'Operação inválida', 400)
  const rest = match[2] || 'overview', write = method !== 'GET'; if (!await member(Number(user.id), businessId, write)) return fail(req, write ? 'Somente owner/admin pode alterar o Delivery 360.' : 'Você não participa desta operação.', 403)
  const p: any = write ? await body(req) : {}
  try {
    if (method === 'GET' && rest === 'overview') return await overview(req, businessId)
    if (method === 'POST' && rest === 'brands') return await createBrand(req, businessId, Number(user.id), p)
    let m = rest.match(/^brands\/(\d+)$/); if (method === 'PATCH' && m) return await patchBrand(req, businessId, Number(user.id), positiveId(m[1]), p)
    if (method === 'POST' && rest === 'zones') return await createZone(req, businessId, Number(user.id), p)
    m = rest.match(/^zones\/(\d+)$/); if (method === 'PATCH' && m) return await patchZone(req, businessId, Number(user.id), positiveId(m[1]), p)
    if (method === 'POST' && rest === 'drivers') return await createDriver(req, businessId, Number(user.id), p)
    m = rest.match(/^drivers\/(\d+)$/); if (method === 'PATCH' && m) return await patchDriver(req, businessId, Number(user.id), positiveId(m[1]), p)
    m = rest.match(/^deliveries\/(\d+)$/); if (method === 'PUT' && m) return await saveDelivery(req, businessId, Number(user.id), positiveId(m[1]), p)
    if (method === 'PUT' && rest === 'settings') return await saveSettings(req, businessId, Number(user.id), p)
    if (method === 'POST' && rest === 'routes') return await createRoute(req, businessId, Number(user.id), p)
    m = rest.match(/^routes\/(\d+)$/); if (method === 'PATCH' && m) return await patchRoute(req, businessId, Number(user.id), positiveId(m[1]), p)
    if (method === 'POST' && rest === 'driver-ledger') return await createLedger(req, businessId, Number(user.id), p)
    m = rest.match(/^customer-brands\/(\d+)$/); if (method === 'PATCH' && m) return await patchCustomerBrand(req, businessId, Number(user.id), positiveId(m[1]), p)
    if (method === 'PUT' && rest === 'loyalty') return await saveLoyalty(req, businessId, Number(user.id), p)
    if (method === 'POST' && rest === 'promos') return await createPromo(req, businessId, Number(user.id), p)
    return fail(req, 'Rota não encontrada', 404)
  } catch (error) {
    console.error('delivery-v41', error)
    return fail(req, 'Falha interna no Delivery 360', 500)
  }
})
