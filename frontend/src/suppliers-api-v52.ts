const localSuppliers=import.meta.env.VITE_API_URL||'/api'
const productionSuppliers='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-suppliers-v52'
export const SUPPLIERS_API=(import.meta.env.VITE_SUPPLIERS_API_URL||(import.meta.env.DEV?localSuppliers:productionSuppliers)).replace(/\/$/,'')

export async function suppliersRequest(path:string,options:RequestInit={},token=localStorage.getItem('c360_token')||''){
  const response=await fetch(`${SUPPLIERS_API}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
  })
  const body=await response.json().catch(()=>({detail:'Resposta inválida'}))
  if(!response.ok){const error:any=new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir');error.status=response.status;throw error}
  return body
}
