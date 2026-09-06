export const INTELLIGENCE_API=(import.meta.env.VITE_INTELLIGENCE_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-intelligence-v50').replace(/\/$/,'')

export async function intelligenceRequest(path:string,options:RequestInit={},token=localStorage.getItem('c360_token')||''){
  const response=await fetch(`${INTELLIGENCE_API}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
  })
  const body=await response.json().catch(()=>({detail:'Resposta inválida'}))
  if(!response.ok){const error:any=new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir');error.status=response.status;throw error}
  return body
}
