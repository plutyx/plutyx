from __future__ import annotations
from dataclasses import dataclass
from math import floor

@dataclass(frozen=True)
class PriceResult:
    minimum_price_cents:int
    contribution_cents:int
    contribution_margin_bps:int
    cpa_max_cents:int

def ingredient_cost_cents(price_cents:int, usable_qty_milliunits:int, used_qty_milliunits:int)->int:
    if usable_qty_milliunits<=0 or used_qty_milliunits<0: raise ValueError("quantidades inválidas")
    return round(price_cents*used_qty_milliunits/usable_qty_milliunits)

def product_unit_cost_cents(recipe_cost_cents:int, units_per_batch:int, packaging_cents_per_unit:int, energy_cents_per_batch:int=0, labor_cents_per_batch:int=0)->int:
    if units_per_batch<=0: raise ValueError("units_per_batch deve ser positivo")
    return round((recipe_cost_cents+energy_cents_per_batch+labor_cents_per_batch)/units_per_batch)+packaging_cents_per_unit

def minimum_price_cents(cost_direct_cents:int,delivery_cents:int,promo_cents:int,media_cents:int,desired_contribution_cents:int,fee_bps:int,fixed_fee_cents:int=0)->int:
    if not 0<=fee_bps<10000: raise ValueError("fee_bps inválido")
    numerator=cost_direct_cents+delivery_cents+promo_cents+media_cents+desired_contribution_cents+fixed_fee_cents
    denominator=10000-fee_bps
    return (numerator*10000+denominator-1)//denominator

def channel_contribution_cents(sale_price_cents:int,cost_direct_cents:int,fee_bps:int,fixed_fee_cents:int=0,delivery_cents:int=0,promo_cents:int=0,media_cents:int=0)->int:
    fee=round(sale_price_cents*fee_bps/10000)
    return sale_price_cents-cost_direct_cents-fee-fixed_fee_cents-delivery_cents-promo_cents-media_cents

def cpa_max_cents(contribution_before_media_cents:int,min_contribution_cents:int)->int:
    return max(0,contribution_before_media_cents-min_contribution_cents)

def price_result(sale_price_cents:int,cost_direct_cents:int,fee_bps:int,fixed_fee_cents:int,delivery_cents:int,promo_cents:int,media_cents:int,desired_contribution_cents:int,min_contribution_cents:int)->PriceResult:
    min_price=minimum_price_cents(cost_direct_cents,delivery_cents,promo_cents,media_cents,desired_contribution_cents,fee_bps,fixed_fee_cents)
    contribution=channel_contribution_cents(sale_price_cents,cost_direct_cents,fee_bps,fixed_fee_cents,delivery_cents,promo_cents,media_cents)
    before_media=channel_contribution_cents(sale_price_cents,cost_direct_cents,fee_bps,fixed_fee_cents,delivery_cents,promo_cents,0)
    margin=round(contribution*10000/sale_price_cents) if sale_price_cents>0 else 0
    return PriceResult(min_price,contribution,margin,cpa_max_cents(before_media,min_contribution_cents))

def capacity(step_minutes_and_parallelism:list[tuple[int,int]],safety_margin_bps:int=2500)->tuple[int,int]:
    if not step_minutes_and_parallelism:return 0,0
    ceilings=[]
    for minutes,parallelism in step_minutes_and_parallelism:
        if minutes<=0 or parallelism<=0: raise ValueError("etapa inválida")
        ceilings.append(floor(60/minutes*parallelism))
    technical=min(ceilings); safe=floor(technical*(10000-safety_margin_bps)/10000)
    return technical,max(0,safe)

def capacity_signal(open_orders:int,safe_capacity:int)->str:
    if safe_capacity<=0:return "unknown"
    ratio=open_orders/safe_capacity
    if ratio<.70:return "green"
    if ratio<=1:return "yellow"
    return "red"

def decide_next_action(*,contribution_below_floor:bool,capacity_ratio:float,traffic_active:bool,delay_rate:float,error_rate:float,cpa_over_limit:bool,ingredient_price_alert:bool,repeat_rate:float|None,product_stable:bool)->dict:
    if contribution_below_floor:return {"code":"margin","title":"Corrija preço ou custo antes de crescer","severity":"critical"}
    if capacity_ratio>=1:return {"code":"capacity_red","title":"Pause novas entradas","severity":"critical"}
    if capacity_ratio>=.70 and traffic_active:return {"code":"capacity_yellow","title":"Não aumente mídia agora","severity":"warning"}
    if delay_rate>=.15 or error_rate>=.08:return {"code":"operations","title":"Corrija a operação antes de buscar mais pedidos","severity":"warning"}
    if cpa_over_limit:return {"code":"cpa","title":"Pause ou ajuste a campanha","severity":"warning"}
    if ingredient_price_alert:return {"code":"cost_change","title":"Revise os produtos afetados pelo novo custo","severity":"info"}
    if repeat_rate is not None and repeat_rate<.15 and product_stable:return {"code":"repeat","title":"Trabalhe recompra consentida","severity":"info"}
    return {"code":"steady","title":"Mantenha o ciclo e mude uma variável por vez","severity":"good"}
