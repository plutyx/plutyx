import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const PROD_ORIGIN = 'https://cozinha-360-os.netlify.app'
const allowedOrigins = new Set([PROD_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'])

function cors(req: Request) {
  const origin = req.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : PROD_ORIGIN,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}

const j = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors(req) })
const fail = (req: Request, detail: string, status = 400) => j(req, { detail }, status)
const parseJson = async (req: Request) => { try { return await req.json() } catch { return {} } }
const nowIso = () => new Date().toISOString()
const int = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback
const money = (v: unknown) => Math.max(0, Math.round(Number(v || 0)))

function routePath(req: Request) {
  const path = new URL(req.url).pathname
  const marker = '/cozinha360-margin-v14'
  const i = path.indexOf(marker)
  return i >= 0 ? (path.slice(i + marker.length) || '/') : path
}

async function authUser(req: Request) {
  const header = req.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

async function ensureProfile(authUser: any) {
  let { data: row } = await admin.from('users').select('*').eq('auth_user_id', authUser.id).maybeSingle()
  const email = String(authUser.email || '').toLowerCase()
  const fullName = String(authUser.user_metadata?.full_name || authUser.user_metadata?.name || '')
  if (!row && email) {
    const { data: existing } = await admin.from('users').select('*').ilike('email', email).maybeSingle()
    if (existing) {
      const { data: updated, error } = await admin.from('users')
        .update({ auth_user_id: authUser.id, full_name: existing.full_name || fullName, updated_at: nowIso() })
        .eq('id', existing.id).select('*').single()
      if (error) throw error
      row = updated
    }
  }
  if (!row) {
    const { data: created, error } = await admin.from('users')
      .insert({ email, password_hash: 'supabase-auth', full_name: fullName, auth_user_id: authUser.id })
      .select('*').single()
    if (error) throw error
    row = created
  }
  return row
}

async function context(req: Request) {
  const auth = await authUser(req)
  if (!auth) return null
  return { auth, profile: await ensureProfile(auth) }
}

async function membership(userId: number, businessId: number, roles = ['owner', 'admin', 'member']) {
  const { data, error } = await admin.from('memberships').select('*')
    .eq('user_id', userId).eq('business_id', businessId).maybeSingle()
  if (error) throw error
  if (!data || !roles.includes(data.role)) return null
  return data
}

async function audit(businessId: number, userId: number, action: string, entityType: string, entityId: unknown, payload: unknown = {}) {
  await admin.from('audit_logs').insert({
    business_id: businessId,
    actor_user_id: userId,
    action,
    entity_type: entityType,
    entity_id: String(entityId ?? ''),
    payload_json: JSON.stringify(payload),
  })
}

async function productCosts(businessId: number) {
  const [{ data: products = [] }, { data: ingredients = [] }, { data: recipes = [] }] = await Promise.all([
    admin.from('products').select('*').eq('business_id', businessId).eq('soft_deleted', false),
    admin.from('ingredients').select('*').eq('business_id', businessId).eq('soft_deleted', false),
    admin.from('recipe_items').select('*'),
  ])
  const ingredientMap = new Map((ingredients || []).map((x: any) => [Number(x.id), x]))
  const costs: Record<number, number> = {}
  for (const product of products || []) {
    let recipeBatch = 0
    for (const item of (recipes || []).filter((x: any) => Number(x.product_id) === Number(product.id))) {
      const ingredient: any = ingredientMap.get(Number(item.ingredient_id))
      if (!ingredient) continue
      const usable = Math.max(1, Number(ingredient.usable_qty_milliunits || 1))
      recipeBatch += Math.round(
        Number(ingredient.last_purchase_price_cents || 0) * Number(item.qty_used_milliunits || 0) / usable,
      )
    }
    const units = Math.max(1, Number(product.units_per_batch || 1))
    const batch = recipeBatch
      + Number(product.energy_cents_per_batch || 0)
      + Number(product.labor_cents_per_batch || 0)
      + Number(product.packaging_cents_per_unit || 0) * units
    costs[Number(product.id)] = Math.max(0, Math.round(batch / units))
  }
  return costs
}

function marginRow(product: any, channel: any, price: any, costCents: number) {
  const sale = money(price?.sale_price_cents)
  const desired = money(price?.desired_contribution_cents ?? 1000)
  const feeBps = Math.min(9999, Math.max(0, int(channel.fee_bps)))
  const fee = Math.round(sale * feeBps / 10000)
  const fixed = money(channel.fixed_fee_cents)
  const delivery = money(channel.delivery_cents)
  const promo = money(channel.promo_cents)
  const media = money(channel.media_cents)
  const channelBurden = fee + fixed + delivery + promo + media
  const contribution = sale - costCents - channelBurden
  const minimum = Math.ceil(
    (costCents + fixed + delivery + promo + media + desired) * 10000 / Math.max(1, 10000 - feeBps),
  )
  const marginBps = sale > 0 ? Math.round(contribution * 10000 / sale) : 0
  const gap = sale - minimum
  return {
    product_id: product.id,
    product_name: product.name,
    brand_id: product.brand_id,
    channel_id: channel.id,
    channel_name: channel.name,
    sale_price_cents: sale,
    estimated_unit_cost_cents: costCents,
    fee_cents: fee,
    fixed_fee_cents: fixed,
    delivery_cents: delivery,
    promo_cents: promo,
    media_cents: media,
    channel_burden_cents: channelBurden,
    desired_contribution_cents: desired,
    contribution_cents: contribution,
    contribution_margin_bps: marginBps,
    minimum_price_cents: minimum,
    gap_to_minimum_cents: gap,
    signal: sale <= 0 ? 'unset' : gap < 0 ? 'danger' : gap < Math.max(100, Math.round(minimum * .05)) ? 'warning' : 'healthy',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
  const path = routePath(req)
  const method = req.method

  try {
    if (path === '/livez' && method === 'GET') return j(req, { ok: true, service: 'cozinha360-margin', version: '1.4.0' })
    if (path === '/readyz' && method === 'GET') {
      const { error } = await admin.from('brands').select('id', { head: true, count: 'exact' })
      return error ? fail(req, 'database_not_ready', 503) : j(req, { ok: true, database: 'ready', version: '1.4.0' })
    }

    const ctx = await context(req)
    if (!ctx) return fail(req, 'Sessão inválida', 401)
    const user: any = ctx.profile

    let m = path.match(/^\/businesses\/(\d+)\/brands$/)
    if (m && method === 'GET') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid)) return fail(req, 'Sem acesso', 403)
      const { data, error } = await admin.from('brands').select('*')
        .eq('business_id', bid).eq('soft_deleted', false).order('name')
      if (error) throw error
      return j(req, data || [])
    }
    if (m && method === 'POST') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid, ['owner', 'admin'])) return fail(req, 'Somente owner/admin', 403)
      const body = await parseJson(req)
      const name = String(body.name || '').trim()
      if (name.length < 2 || name.length > 120) return fail(req, 'Nome da marca deve ter entre 2 e 120 caracteres', 422)
      const { data, error } = await admin.from('brands')
        .insert({ business_id: bid, name, active: body.active !== false })
        .select('*').single()
      if (error) {
        if (String(error.message).toLowerCase().includes('duplicate')) return fail(req, 'Marca já cadastrada', 409)
        throw error
      }
      await audit(bid, user.id, 'brand.created', 'brand', data.id, { name })
      return j(req, data, 201)
    }

    m = path.match(/^\/businesses\/(\d+)\/products\/(\d+)\/brand$/)
    if (m && method === 'PATCH') {
      const bid = Number(m[1]), productId = Number(m[2])
      if (!await membership(user.id, bid, ['owner', 'admin'])) return fail(req, 'Somente owner/admin', 403)
      const body = await parseJson(req)
      const brandId = body.brand_id == null || body.brand_id === '' ? null : Number(body.brand_id)
      const { data: product } = await admin.from('products').select('*').eq('id', productId).eq('business_id', bid).eq('soft_deleted', false).maybeSingle()
      if (!product) return fail(req, 'Produto não encontrado', 404)
      if (brandId !== null) {
        const { data: brand } = await admin.from('brands').select('id').eq('id', brandId).eq('business_id', bid).eq('soft_deleted', false).maybeSingle()
        if (!brand) return fail(req, 'Marca não encontrada', 404)
      }
      const { data, error } = await admin.from('products').update({ brand_id: brandId, updated_at: nowIso(), version: Number(product.version || 1) + 1 })
        .eq('id', productId).eq('business_id', bid).select('*').single()
      if (error) throw error
      await audit(bid, user.id, 'product.brand_assigned', 'product', productId, { brand_id: brandId })
      return j(req, data)
    }

    m = path.match(/^\/businesses\/(\d+)\/channels$/)
    if (m && method === 'GET') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid)) return fail(req, 'Sem acesso', 403)
      const { data, error } = await admin.from('channels').select('*').eq('business_id', bid).order('name')
      if (error) throw error
      return j(req, data || [])
    }
    if (m && method === 'POST') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid, ['owner', 'admin'])) return fail(req, 'Somente owner/admin', 403)
      const body = await parseJson(req)
      const name = String(body.name || '').trim()
      const feeBps = int(body.fee_bps)
      if (name.length < 2 || name.length > 120) return fail(req, 'Nome do canal inválido', 422)
      if (feeBps < 0 || feeBps >= 10000) return fail(req, 'Taxa percentual inválida', 422)
      const row = {
        business_id: bid,
        name,
        fee_bps: feeBps,
        fixed_fee_cents: money(body.fixed_fee_cents),
        delivery_cents: money(body.delivery_cents),
        promo_cents: money(body.promo_cents),
        media_cents: money(body.media_cents),
        traffic_active: Boolean(body.traffic_active),
      }
      const { data, error } = await admin.from('channels').insert(row).select('*').single()
      if (error) {
        if (String(error.message).toLowerCase().includes('duplicate')) return fail(req, 'Canal já cadastrado', 409)
        throw error
      }
      await audit(bid, user.id, 'channel.created', 'channel', data.id, row)
      return j(req, data, 201)
    }

    m = path.match(/^\/businesses\/(\d+)\/product-channel-prices$/)
    if (m && method === 'PUT') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid, ['owner', 'admin'])) return fail(req, 'Somente owner/admin', 403)
      const body = await parseJson(req)
      const productId = Number(body.product_id), channelId = Number(body.channel_id)
      const [{ data: product }, { data: channel }] = await Promise.all([
        admin.from('products').select('id').eq('id', productId).eq('business_id', bid).eq('soft_deleted', false).maybeSingle(),
        admin.from('channels').select('id').eq('id', channelId).eq('business_id', bid).maybeSingle(),
      ])
      if (!product || !channel) return fail(req, 'Produto ou canal não encontrado', 404)
      const row = {
        business_id: bid,
        product_id: productId,
        channel_id: channelId,
        sale_price_cents: money(body.sale_price_cents),
        desired_contribution_cents: money(body.desired_contribution_cents ?? 1000),
        updated_at: nowIso(),
      }
      const { data, error } = await admin.from('product_channel_prices')
        .upsert(row, { onConflict: 'product_id,channel_id' }).select('*').single()
      if (error) throw error
      await audit(bid, user.id, 'product_channel_price.updated', 'product_channel_price', data.id, row)
      return j(req, data)
    }

    m = path.match(/^\/businesses\/(\d+)\/margin-matrix$/)
    if (m && method === 'GET') {
      const bid = Number(m[1])
      if (!await membership(user.id, bid)) return fail(req, 'Sem acesso', 403)
      const [{ data: products = [] }, { data: channels = [] }, { data: prices = [] }, { data: brands = [] }] = await Promise.all([
        admin.from('products').select('*').eq('business_id', bid).eq('soft_deleted', false).eq('active', true).order('name'),
        admin.from('channels').select('*').eq('business_id', bid).order('name'),
        admin.from('product_channel_prices').select('*').eq('business_id', bid),
        admin.from('brands').select('*').eq('business_id', bid).eq('soft_deleted', false),
      ])
      const costs = await productCosts(bid)
      const priceMap = new Map((prices || []).map((x: any) => [`${x.product_id}:${x.channel_id}`, x]))
      const brandMap = new Map((brands || []).map((x: any) => [Number(x.id), x.name]))
      const rows = []
      for (const product of products || []) {
        for (const channel of channels || []) {
          rows.push(marginRow(product, channel, priceMap.get(`${product.id}:${channel.id}`), costs[Number(product.id)] || 0))
        }
      }
      const configured = rows.filter((x: any) => x.sale_price_cents > 0)
      const danger = configured.filter((x: any) => x.signal === 'danger').length
      const warning = configured.filter((x: any) => x.signal === 'warning').length
      return j(req, {
        products: (products || []).map((p: any) => ({ ...p, brand_name: p.brand_id ? brandMap.get(Number(p.brand_id)) || null : null, estimated_unit_cost_cents: costs[Number(p.id)] || 0 })),
        brands: brands || [],
        channels: channels || [],
        rows,
        summary: {
          configured_prices: configured.length,
          products_without_brand: (products || []).filter((p: any) => !p.brand_id).length,
          danger,
          warning,
          healthy: configured.filter((x: any) => x.signal === 'healthy').length,
        },
      })
    }

    return fail(req, 'Rota não encontrada', 404)
  } catch (error) {
    console.error('cozinha360-margin edge error', error)
    return fail(req, 'Erro interno', 500)
  }
})
