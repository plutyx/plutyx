from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

def utcnow(): return datetime.now(timezone.utc)

class TS:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

class User(Base, TS):
    __tablename__="users"
    id: Mapped[int]=mapped_column(primary_key=True)
    email: Mapped[str]=mapped_column(String(320),unique=True,index=True)
    password_hash: Mapped[str]=mapped_column(String(255))
    full_name: Mapped[str]=mapped_column(String(120),default="")
    is_active: Mapped[bool]=mapped_column(Boolean,default=True)

class Business(Base, TS):
    __tablename__="businesses"
    id: Mapped[int]=mapped_column(primary_key=True)
    name: Mapped[str]=mapped_column(String(160))
    city: Mapped[str]=mapped_column(String(120),default="")
    timezone: Mapped[str]=mapped_column(String(64),default="America/Sao_Paulo")
    currency: Mapped[str]=mapped_column(String(3),default="BRL")
    min_contribution_cents: Mapped[int]=mapped_column(Integer,default=1000)
    safety_margin_bps: Mapped[int]=mapped_column(Integer,default=2500)
    price_alert_threshold_bps: Mapped[int]=mapped_column(Integer,default=500)
    soft_deleted: Mapped[bool]=mapped_column(Boolean,default=False)

class Membership(Base, TS):
    __tablename__="memberships"; __table_args__=(UniqueConstraint("user_id","business_id",name="uq_member_business"),)
    id: Mapped[int]=mapped_column(primary_key=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("users.id",ondelete="CASCADE"),index=True)
    business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    role: Mapped[str]=mapped_column(String(20),default="member")
    preferences_json: Mapped[str]=mapped_column(Text,default="{}")

class Ingredient(Base, TS):
    __tablename__="ingredients"; __table_args__=(UniqueConstraint("business_id","name",name="uq_ingredient_name_business"),)
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    name: Mapped[str]=mapped_column(String(160)); unit: Mapped[str]=mapped_column(String(20),default="g")
    last_purchase_price_cents: Mapped[int]=mapped_column(Integer,default=0); last_purchase_qty_milliunits: Mapped[int]=mapped_column(Integer,default=1000)
    usable_qty_milliunits: Mapped[int]=mapped_column(Integer,default=1000); soft_deleted: Mapped[bool]=mapped_column(Boolean,default=False); version: Mapped[int]=mapped_column(Integer,default=1)

class Supplier(Base, TS):
    __tablename__="suppliers"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    name: Mapped[str]=mapped_column(String(160)); cnpj: Mapped[str]=mapped_column(String(20),default=""); phone: Mapped[str]=mapped_column(String(40),default="")
    backup_supplier: Mapped[bool]=mapped_column(Boolean,default=False); notes: Mapped[str]=mapped_column(Text,default=""); soft_deleted: Mapped[bool]=mapped_column(Boolean,default=False)

class Purchase(Base, TS):
    __tablename__="purchases"; __table_args__=(UniqueConstraint("business_id","idempotency_key",name="uq_purchase_idem"),)
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    ingredient_id: Mapped[int]=mapped_column(ForeignKey("ingredients.id",ondelete="RESTRICT"),index=True); supplier_id: Mapped[int|None]=mapped_column(ForeignKey("suppliers.id",ondelete="SET NULL"),nullable=True)
    quantity_milliunits: Mapped[int]=mapped_column(Integer); total_cents: Mapped[int]=mapped_column(Integer); freight_cents: Mapped[int]=mapped_column(Integer,default=0); tax_cents: Mapped[int]=mapped_column(Integer,default=0)
    idempotency_key: Mapped[str]=mapped_column(String(100))

class Product(Base, TS):
    __tablename__="products"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    name: Mapped[str]=mapped_column(String(160)); units_per_batch: Mapped[int]=mapped_column(Integer,default=1); packaging_cents_per_unit: Mapped[int]=mapped_column(Integer,default=0)
    energy_cents_per_batch: Mapped[int]=mapped_column(Integer,default=0); labor_cents_per_batch: Mapped[int]=mapped_column(Integer,default=0); soft_deleted: Mapped[bool]=mapped_column(Boolean,default=False); version: Mapped[int]=mapped_column(Integer,default=1)

class RecipeItem(Base, TS):
    __tablename__="recipe_items"; __table_args__=(UniqueConstraint("product_id","ingredient_id",name="uq_recipe_item"),)
    id: Mapped[int]=mapped_column(primary_key=True); product_id: Mapped[int]=mapped_column(ForeignKey("products.id",ondelete="CASCADE"),index=True); ingredient_id: Mapped[int]=mapped_column(ForeignKey("ingredients.id",ondelete="RESTRICT"),index=True); qty_used_milliunits: Mapped[int]=mapped_column(Integer)

class Channel(Base, TS):
    __tablename__="channels"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    name: Mapped[str]=mapped_column(String(120)); fee_bps: Mapped[int]=mapped_column(Integer,default=0); fixed_fee_cents: Mapped[int]=mapped_column(Integer,default=0); delivery_cents: Mapped[int]=mapped_column(Integer,default=0); promo_cents: Mapped[int]=mapped_column(Integer,default=0); media_cents: Mapped[int]=mapped_column(Integer,default=0); traffic_active: Mapped[bool]=mapped_column(Boolean,default=False)

class ProductChannelPrice(Base, TS):
    __tablename__="product_channel_prices"; __table_args__=(UniqueConstraint("product_id","channel_id",name="uq_product_channel"),)
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True); product_id: Mapped[int]=mapped_column(ForeignKey("products.id",ondelete="CASCADE"),index=True); channel_id: Mapped[int]=mapped_column(ForeignKey("channels.id",ondelete="CASCADE"),index=True)
    sale_price_cents: Mapped[int]=mapped_column(Integer); desired_contribution_cents: Mapped[int]=mapped_column(Integer,default=1000)

class Customer(Base, TS):
    __tablename__="customers"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True)
    name: Mapped[str]=mapped_column(String(160)); phone: Mapped[str]=mapped_column(String(40),default=""); email: Mapped[str]=mapped_column(String(320),default=""); consent_marketing: Mapped[bool]=mapped_column(Boolean,default=False); opted_out_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)

class Order(Base, TS):
    __tablename__="orders"; __table_args__=(UniqueConstraint("business_id","idempotency_key",name="uq_order_idem"),Index("ix_order_business_status","business_id","status"))
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True); customer_id: Mapped[int|None]=mapped_column(ForeignKey("customers.id",ondelete="SET NULL"),nullable=True); channel_id: Mapped[int|None]=mapped_column(ForeignKey("channels.id",ondelete="SET NULL"),nullable=True)
    status: Mapped[str]=mapped_column(String(32),default="new"); source: Mapped[str]=mapped_column(String(120),default="manual"); total_cents: Mapped[int]=mapped_column(Integer,default=0); variable_cost_cents: Mapped[int]=mapped_column(Integer,default=0); contribution_cents: Mapped[int]=mapped_column(Integer,default=0); paid: Mapped[bool]=mapped_column(Boolean,default=False); delayed: Mapped[bool]=mapped_column(Boolean,default=False); error_flag: Mapped[bool]=mapped_column(Boolean,default=False); idempotency_key: Mapped[str]=mapped_column(String(100)); version: Mapped[int]=mapped_column(Integer,default=1); completed_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)

class Loss(Base, TS):
    __tablename__="losses"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True); ingredient_id: Mapped[int|None]=mapped_column(ForeignKey("ingredients.id",ondelete="SET NULL"),nullable=True); reason: Mapped[str]=mapped_column(String(120)); qty_milliunits: Mapped[int]=mapped_column(Integer,default=0); estimated_cost_cents: Mapped[int]=mapped_column(Integer,default=0)

class CapacityStep(Base, TS):
    __tablename__="capacity_steps"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True); name: Mapped[str]=mapped_column(String(120)); minutes_per_order: Mapped[int]=mapped_column(Integer); parallelism: Mapped[int]=mapped_column(Integer,default=1)

class AuditLog(Base):
    __tablename__="audit_logs"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),index=True); actor_user_id: Mapped[int|None]=mapped_column(ForeignKey("users.id",ondelete="SET NULL"),nullable=True); action: Mapped[str]=mapped_column(String(120)); entity_type: Mapped[str]=mapped_column(String(80)); entity_id: Mapped[str]=mapped_column(String(80),default=""); payload_json: Mapped[str]=mapped_column(Text,default="{}"); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=False)

class WebhookEvent(Base):
    __tablename__="webhook_events"; __table_args__=(UniqueConstraint("provider","provider_event_id",name="uq_webhook_provider_event"),)
    id: Mapped[int]=mapped_column(primary_key=True); provider: Mapped[str]=mapped_column(String(64),index=True); provider_event_id: Mapped[str]=mapped_column(String(180)); payload_json: Mapped[str]=mapped_column(Text); status: Mapped[str]=mapped_column(String(32),default="received"); attempts: Mapped[int]=mapped_column(Integer,default=0); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow)

class OutboxEvent(Base):
    __tablename__="outbox_events"
    id: Mapped[int]=mapped_column(primary_key=True); business_id: Mapped[int|None]=mapped_column(ForeignKey("businesses.id",ondelete="CASCADE"),nullable=True,index=True); topic: Mapped[str]=mapped_column(String(120),index=True); payload_json: Mapped[str]=mapped_column(Text); status: Mapped[str]=mapped_column(String(32),default="pending"); attempts: Mapped[int]=mapped_column(Integer,default=0); available_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=utcnow)
