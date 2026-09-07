import React, { useEffect, useState } from 'react'
import { intelligenceRequest } from './intelligence-api-v50'

const API = import.meta.env.VITE_API_URL || '/api'

type Business = { id:number; name:string }
type Ingredient = {
  id:number; name:string; unit:string; on_hand_milliunits:number;
  par_level_milliunits:number; reorder_target_milliunits:number; version:number
}
type Editing = { businessId:number; ingredient:Ingredient }

async function request(path:string, options:RequestInit={}){
  const token=localStorage.getItem('c360_token')||''
  const res=await fetch(`${API}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
  })
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok)throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}

export function InventoryStockEditor(){
  const [editing,setEditing]=useState<Editing|null>(null)
  const [onHand,setOnHand]=useState(0)
  const [par,setPar]=useState(0)
  const [target,setTarget]=useState(0)
  const [loading,setLoading]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [toast,setToast]=useState('')

  useEffect(()=>{
    const intercept=async(event:MouseEvent)=>{
      const el=event.target instanceof Element?event.target:null
      const button=el?.closest('button.secondary') as HTMLButtonElement|null
      if(!button||button.textContent?.trim()!=='Estoque'||!button.closest('.workspace'))return
      const row=button.closest('.row.richer')
      const ingredientName=row?.querySelector('b')?.textContent?.trim()
      if(!ingredientName)return

      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation()
      setLoading(true);setError('')
      try{
        const me=await request('/me')
        const businesses=(me.businesses||[]) as Business[]
        const visibleBusinessName=document.querySelector('.workspace > header h2')?.textContent?.trim()||''
        const business=businesses.find(x=>x.name===visibleBusinessName)||businesses[0]
        if(!business)throw new Error('Operação não encontrada')
        const rows=await request(`/businesses/${business.id}/ingredients`) as Ingredient[]
        const ingredient=rows.find(x=>x.name===ingredientName)
        if(!ingredient)throw new Error('Ingrediente não encontrado')
        setEditing({businessId:business.id,ingredient})
        setOnHand(ingredient.on_hand_milliunits||0)
        setPar(ingredient.par_level_milliunits||0)
        setTarget(ingredient.reorder_target_milliunits||ingredient.par_level_milliunits||0)
      }catch(e){setToast(e instanceof Error?e.message:'Não foi possível abrir o estoque');setTimeout(()=>setToast(''),2800)}
      finally{setLoading(false)}
    }
    document.addEventListener('click',intercept,true)
    return()=>document.removeEventListener('click',intercept,true)
  },[])

  useEffect(()=>{
    if(!editing)return
    const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)setEditing(null)}
    document.addEventListener('keydown',esc)
    return()=>document.removeEventListener('keydown',esc)
  },[editing,busy])

  async function save(e:React.FormEvent){
    e.preventDefault();if(!editing)return
    setError('')
    if(!Number.isInteger(onHand)||!Number.isInteger(par)||!Number.isInteger(target)||onHand<0||par<0||target<0){setError('Use valores inteiros iguais ou maiores que zero.');return}
    if(target<par){setError('O alvo de reposição precisa ser igual ou maior que o estoque mínimo.');return}
    setBusy(true)
    try{
      await intelligenceRequest(`/businesses/${editing.businessId}/ingredients/${editing.ingredient.id}/inventory`,{
        method:'PATCH',
        body:JSON.stringify({
          on_hand_milliunits:onHand,
          par_level_milliunits:par,
          reorder_target_milliunits:target,
          expected_version:editing.ingredient.version,
        }),
      })
      const updatedBusinessId=editing.businessId,updatedIngredientId=editing.ingredient.id
      setEditing(null);setToast('Estoque configurado e auditado na nuvem.')
      window.dispatchEvent(new CustomEvent('c360:inventory-updated',{detail:{businessId:updatedBusinessId,ingredientId:updatedIngredientId}}))
      setTimeout(()=>document.querySelector<HTMLButtonElement>('.header-actions .icon-btn')?.click(),0)
      setTimeout(()=>setToast(''),2400)
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o estoque')}
    finally{setBusy(false)}
  }

  return <>
    {loading&&<div className="inventory-toast">Abrindo estoque…</div>}
    {toast&&<div className="inventory-toast success" role="status">{toast}</div>}
    {editing&&<div className="inventory-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditing(null)}}>
      <section className="inventory-drawer" role="dialog" aria-modal="true" aria-labelledby="inventory-title">
        <div className="inventory-drawer-head">
          <div><span>ESTOQUE</span><h2 id="inventory-title">{editing.ingredient.name}</h2><p>Defina o que existe agora e quando o sistema deve sugerir reposição.</p></div>
          <button type="button" className="inventory-close" onClick={()=>!busy&&setEditing(null)} aria-label="Fechar">×</button>
        </div>
        <form onSubmit={save}>
          <label>Estoque atual <small>{editing.ingredient.unit}</small><input autoFocus type="number" min="0" step="1" value={onHand} onChange={e=>setOnHand(Number(e.target.value))}/></label>
          <div className="inventory-fields">
            <label>Nível mínimo <small>gera alerta</small><input type="number" min="0" step="1" value={par} onChange={e=>setPar(Number(e.target.value))}/></label>
            <label>Alvo de reposição <small>quanto voltar a ter</small><input type="number" min="0" step="1" value={target} onChange={e=>setTarget(Number(e.target.value))}/></label>
          </div>
          <div className="inventory-rule"><b>Regra simples</b><span>Quando o estoque cair abaixo de {par} {editing.ingredient.unit}, a compra sugerida tenta levar você de volta a {target} {editing.ingredient.unit}.</span></div>
          {error&&<div className="inventory-error" role="alert">{error}</div>}
          <div className="inventory-actions"><button type="button" className="inventory-cancel" onClick={()=>setEditing(null)} disabled={busy}>Cancelar</button><button className="inventory-save" disabled={busy}>{busy?'Salvando…':'Salvar estoque'}</button></div>
        </form>
      </section>
    </div>}
  </>
}
