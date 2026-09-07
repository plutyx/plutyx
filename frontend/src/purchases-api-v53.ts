const localPurchases=import.meta.env.VITE_API_URL||'/api'
const productionPurchases='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-purchases-v53'
export const PURCHASES_API=(import.meta.env.VITE_PURCHASES_API_URL||(import.meta.env.DEV?localPurchases:productionPurchases)).replace(/\/$/,'')

export async function purchasesRequest(path:string,options:RequestInit={},token=localStorage.getItem('c360_token')||''){
 const response=await fetch(`${PURCHASES_API}${path}`,{
  ...options,
  headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
 })
 const body=await response.json().catch(()=>({detail:'Resposta inválida'}))
 if(!response.ok){const error:any=new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir');error.status=response.status;throw error}
 return body
}
