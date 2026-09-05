from __future__ import annotations
import json, uuid
from typing import Annotated
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .config import settings
from .db import Base, engine, get_db
from .auth import hash_password, verify_password, create_token, current_user
from .models import User,Business,Membership,Ingredient,Product,Channel,ProductChannelPrice,Customer,Order,Loss,CapacityStep,AuditLog,OutboxEvent
from .domain import minimum_price_cents,channel_contribution_cents,cpa_max_cents,capacity,capacity_signal,decide_next_action

app=FastAPI(title=settings.app_name,version="0.3.0")
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_list,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

@app.on_event("startup")
def startup(): Base.metadata.create_all(bind=engine)

class SignupIn(BaseModel):
    email:EmailStr; password:str=Field(min_length=10,max_length=128); full_name:str=""
class LoginIn(BaseModel): email:EmailStr; password:str
class BusinessIn(BaseModel): name:str=Field(min_length=2,max_length=160); city:str=""; timezone:str="America/Sao_Paulo"
class IngredientIn(BaseModel): name:str; unit:str="g"; price_cents:int=Field(ge=0); purchase_qty_milliunits:int=Field(gt=0); usable_qty_milliunits:int=Field(gt=0)
class ProductIn(BaseModel): name:str; units_per_batch:int=Field(gt=0); packaging_cents_per_unit:int=Field(ge=0); energy_cents_per_batch:int=Field(ge=0,default=0); labor_cents_per_batch:int=Field(ge=0,default=0)
class ChannelIn(BaseModel): name:str; fee_bps:int=Field(ge=0,lt=10000); fixed_fee_cents:int=Field(ge=0,default=0); delivery_cents:int=Field(ge=0,default=0); promo_cents:int=Field(ge=0,default=0); media_cents:int=Field(ge=0,default=0); traffic_active:bool=False
class PriceIn(BaseModel): product_id:int; channel_id:int; sale_price_cents:int=Field(gt=0); direct_cost_cents:int=Field(ge=0); desired_contribution_cents:int=Field(ge=0)
class OrderIn(BaseModel): customer_id:int|None=None; channel_id:int|None=None; total_cents:int=Field(ge=0); variable_cost_cents:int=Field(ge=0); source:str="manual"; paid:bool=False; idempotency_key:str|None=None
class OrderStatusIn(BaseModel): status:str; expected_version:int=Field(ge=1)
class LossIn(BaseModel): ingredient_id:int|None=None; reason:str; qty_milliunits:int=Field(ge=0); estimated_cost_cents:int=Field(ge=0)
class CapacityIn(BaseModel): steps:list[tuple[int,int]]; safety_margin_bps:int=Field(ge=0,le=9000,default=2500); open_orders:int=Field(ge=0,default=0)


def member_or_404(db:Session,user:User,business_id:int,roles:tuple[str,...]=( "owner","admin","member")):
    m=db.scalar(select(Membership).where(Membership.user_id==user.id,Membership.business_id==business_id))
    if not m or m.role not in roles: raise HTTPException(403,"Sem acesso a este negócio")
    return m

def audit(db:Session,business_id:int,user_id:int,action:str,entity_type:str,entity_id:str,payload:dict|None=None):
    db.add(AuditLog(business_id=business_id,actor_user_id=user_id,action=action,entity_type=entity_type,entity_id=entity_id,payload_json=json.dumps(payload or {},ensure_ascii=False)))

@app.get("/health")
def health(): return {"ok":True,"service":"cozinha360-api","environment":settings.environment}

@app.post("/auth/signup",status_code=201)
def signup(data:SignupIn,db:Annotated[Session,Depends(get_db)]):
    if db.scalar(select(User).where(func.lower(User.email)==data.email.lower())): raise HTTPException(409,"E-mail já cadastrado")
    user=User(email=data.email.lower(),password_hash=hash_password(data.password),full_name=data.full_name.strip())
    db.add(user); db.commit(); db.refresh(user)
    return {"access_token":create_token(user.id,user.email),"token_type":"bearer","user":{"id":user.id,"email":user.email,"full_name":user.full_name}}

@app.post("/auth/login")
def login(data:LoginIn,db:Annotated[Session,Depends(get_db)]):
    user=db.scalar(select(User).where(func.lower(User.email)==data.email.lower()))
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,"Credenciais inválidas")
    return {"access_token":create_token(user.id,user.email),"token_type":"bearer","user":{"id":user.id,"email":user.email,"full_name":user.full_name}}

@app.get("/me")
def me(user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    rows=db.execute(select(Membership,Business).join(Business,Business.id==Membership.business_id).where(Membership.user_id==user.id,Business.soft_deleted==False)).all()
    return {"user":{"id":user.id,"email":user.email,"full_name":user.full_name},"businesses":[{"id":b.id,"name":b.name,"city":b.city,"role":m.role,"preferences":json.loads(m.preferences_json or "{}") } for m,b in rows]}

@app.post("/businesses",status_code=201)
def create_business(data:BusinessIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    b=Business(name=data.name.strip(),city=data.city.strip(),timezone=data.timezone); db.add(b); db.flush(); db.add(Membership(user_id=user.id,business_id=b.id,role="owner")); audit(db,b.id,user.id,"business.created","business",str(b.id),{"name":b.name}); db.commit(); return {"id":b.id,"name":b.name}

@app.get("/businesses/{business_id}/dashboard")
def dashboard(business_id:int,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id)
    orders=db.scalars(select(Order).where(Order.business_id==business_id)).all(); losses=db.scalars(select(Loss).where(Loss.business_id==business_id)).all(); channels=db.scalars(select(Channel).where(Channel.business_id==business_id)).all()
    paid=[o for o in orders if o.paid]; revenue=sum(o.total_cents for o in paid); contribution=sum(o.contribution_cents for o in paid); loss=sum(x.estimated_cost_cents for x in losses)
    open_orders=sum(1 for o in orders if o.status not in ("completed","cancelled")); traffic=any(c.traffic_active for c in channels)
    delay_rate=(sum(1 for o in paid if o.delayed)/len(paid)) if paid else 0; error_rate=(sum(1 for o in paid if o.error_flag)/len(paid)) if paid else 0
    below=any(o.contribution_cents<0 for o in paid); cap_ratio=0.0
    action=decide_next_action(contribution_below_floor=below,capacity_ratio=cap_ratio,traffic_active=traffic,delay_rate=delay_rate,error_rate=error_rate,cpa_over_limit=False,ingredient_price_alert=False,repeat_rate=None,product_stable=len(paid)>=10)
    return {"pulse":{"revenue_cents":revenue,"contribution_cents":contribution,"loss_cents":loss},"open_orders":open_orders,"delay_rate":delay_rate,"error_rate":error_rate,"next_action":action}

@app.post("/businesses/{business_id}/ingredients",status_code=201)
def add_ingredient(business_id:int,data:IngredientIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id,("owner","admin")); ing=Ingredient(business_id=business_id,name=data.name.strip(),unit=data.unit,last_purchase_price_cents=data.price_cents,last_purchase_qty_milliunits=data.purchase_qty_milliunits,usable_qty_milliunits=data.usable_qty_milliunits); db.add(ing); db.flush(); audit(db,business_id,user.id,"ingredient.created","ingredient",str(ing.id)); db.commit(); return {"id":ing.id,"name":ing.name}

@app.get("/businesses/{business_id}/ingredients")
def list_ingredients(business_id:int,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); rows=db.scalars(select(Ingredient).where(Ingredient.business_id==business_id,Ingredient.soft_deleted==False).order_by(Ingredient.name)).all(); return [{"id":x.id,"name":x.name,"unit":x.unit,"last_purchase_price_cents":x.last_purchase_price_cents,"usable_qty_milliunits":x.usable_qty_milliunits,"version":x.version} for x in rows]

@app.post("/businesses/{business_id}/products",status_code=201)
def add_product(business_id:int,data:ProductIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id,("owner","admin")); p=Product(business_id=business_id,**data.model_dump()); db.add(p); db.flush(); audit(db,business_id,user.id,"product.created","product",str(p.id)); db.commit(); return {"id":p.id,"name":p.name}

@app.post("/businesses/{business_id}/channels",status_code=201)
def add_channel(business_id:int,data:ChannelIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id,("owner","admin")); c=Channel(business_id=business_id,**data.model_dump()); db.add(c); db.commit(); db.refresh(c); return {"id":c.id,"name":c.name}

@app.post("/businesses/{business_id}/price-engine")
def price_engine(business_id:int,data:PriceIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); c=db.get(Channel,data.channel_id)
    if not c or c.business_id!=business_id: raise HTTPException(404,"Canal não encontrado")
    minimum=minimum_price_cents(data.direct_cost_cents,c.delivery_cents,c.promo_cents,c.media_cents,data.desired_contribution_cents,c.fee_bps,c.fixed_fee_cents)
    contribution=channel_contribution_cents(data.sale_price_cents,data.direct_cost_cents,c.fee_bps,c.fixed_fee_cents,c.delivery_cents,c.promo_cents,c.media_cents)
    before_media=channel_contribution_cents(data.sale_price_cents,data.direct_cost_cents,c.fee_bps,c.fixed_fee_cents,c.delivery_cents,c.promo_cents,0)
    business=db.get(Business,business_id); cpa=cpa_max_cents(before_media,business.min_contribution_cents)
    return {"minimum_price_cents":minimum,"contribution_cents":contribution,"cpa_max_cents":cpa,"below_floor":contribution<business.min_contribution_cents}

@app.post("/businesses/{business_id}/capacity")
def calc_capacity(business_id:int,data:CapacityIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); technical,safe=capacity(data.steps,data.safety_margin_bps); return {"technical_per_hour":technical,"safe_per_hour":safe,"signal":capacity_signal(data.open_orders,safe)}

@app.post("/businesses/{business_id}/orders",status_code=201)
def create_order(business_id:int,data:OrderIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); key=data.idempotency_key or str(uuid.uuid4()); existing=db.scalar(select(Order).where(Order.business_id==business_id,Order.idempotency_key==key))
    if existing:return {"id":existing.id,"status":existing.status,"idempotent_replay":True}
    o=Order(business_id=business_id,customer_id=data.customer_id,channel_id=data.channel_id,total_cents=data.total_cents,variable_cost_cents=data.variable_cost_cents,contribution_cents=data.total_cents-data.variable_cost_cents,source=data.source,paid=data.paid,idempotency_key=key); db.add(o); db.flush(); audit(db,business_id,user.id,"order.created","order",str(o.id)); db.add(OutboxEvent(business_id=business_id,topic="order.created",payload_json=json.dumps({"order_id":o.id}))); db.commit(); return {"id":o.id,"status":o.status,"contribution_cents":o.contribution_cents,"idempotency_key":key}

@app.patch("/businesses/{business_id}/orders/{order_id}/status")
def update_order_status(business_id:int,order_id:int,data:OrderStatusIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); o=db.get(Order,order_id)
    if not o or o.business_id!=business_id: raise HTTPException(404,"Pedido não encontrado")
    if o.version!=data.expected_version: raise HTTPException(409,"Pedido foi alterado por outra sessão")
    allowed={"new","confirmed","production","checking","awaiting_delivery","completed","cancelled"}
    if data.status not in allowed: raise HTTPException(422,"Status inválido")
    o.status=data.status; o.version+=1; audit(db,business_id,user.id,"order.status_changed","order",str(o.id),{"status":data.status,"version":o.version}); db.commit(); return {"id":o.id,"status":o.status,"version":o.version}

@app.post("/businesses/{business_id}/losses",status_code=201)
def add_loss(business_id:int,data:LossIn,user:Annotated[User,Depends(current_user)],db:Annotated[Session,Depends(get_db)]):
    member_or_404(db,user,business_id); x=Loss(business_id=business_id,**data.model_dump()); db.add(x); db.flush(); audit(db,business_id,user.id,"loss.created","loss",str(x.id)); db.commit(); return {"id":x.id}
