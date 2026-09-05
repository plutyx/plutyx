from app.domain import ingredient_cost_cents, product_unit_cost_cents, minimum_price_cents, channel_contribution_cents, cpa_max_cents, capacity, capacity_signal, decide_next_action

def test_ingredient_cost_uses_usable_quantity():
    assert ingredient_cost_cents(3990,1000,160)==638

def test_unit_cost_includes_packaging_and_batch_costs():
    assert product_unit_cost_cents(3000,10,120,500,500)==520

def test_reverse_price_uses_basis_points_without_float_money():
    assert minimum_price_cents(1200,0,0,300,1000,1500)==2942

def test_channel_contribution_and_cpa_guard():
    contribution=channel_contribution_cents(3000,1200,1000,0,0,0,300)
    assert contribution==1200
    before_media=channel_contribution_cents(3000,1200,1000)
    assert cpa_max_cents(before_media,1000)==500

def test_capacity_uses_bottleneck_and_safety_margin():
    technical,safe=capacity([(6,2),(4,1),(5,1)],2500)
    assert technical==12 and safe==9
    assert capacity_signal(6,safe)=="green"
    assert capacity_signal(7,safe)=="yellow"
    assert capacity_signal(10,safe)=="red"

def test_decision_engine_prioritizes_margin_before_growth():
    action=decide_next_action(contribution_below_floor=True,capacity_ratio=.2,traffic_active=True,delay_rate=0,error_rate=0,cpa_over_limit=False,ingredient_price_alert=False,repeat_rate=.5,product_stable=True)
    assert action["code"]=="margin"
