const KDS_API=import.meta.env.VITE_KDS_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-kds-v54'

export async function kdsRequest(path:string,options:RequestInit={},token=''){
 const response=await fetch(`${KDS_API}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})}})
 const data=await response.json().catch(()=>({detail:'Resposta inválida do KDS 360'}))
 if(!response.ok)throw new Error(data.detail||'Não foi possível carregar o KDS 360')
 return data
}

export const KDS_API_URL=KDS_API
