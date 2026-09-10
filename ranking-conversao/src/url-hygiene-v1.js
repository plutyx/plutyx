(()=>{
  try{
    const url=new URL(location.href);
    let changed=false;
    for(const key of [...url.searchParams.keys()]){
      if(key.toLowerCase().startsWith('utm_')){
        url.searchParams.delete(key);
        changed=true;
      }
    }
    if(changed){
      const clean=`${url.pathname}${url.search}${url.hash}`;
      history.replaceState(history.state,'',clean);
    }
  }catch{}
})();
